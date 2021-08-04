import type Koa from 'koa';
import type { BackendContext } from './context';
import type { Context, State } from '.';
import type { Duplex } from 'stream';
import type { Effect } from 'xxscreeps/utility/types';
import type { Server } from 'http';
import { IncomingMessage, ServerResponse } from 'http';
import sockjs from 'sockjs';
import config from 'xxscreeps/config';
import { checkToken, makeToken } from './auth/token';
import { CodeSubscriptions } from './sockets/code';
import { ConsoleSubscriptions } from './sockets/console';
import { EventEmitter } from 'events';
import { mapSubscription } from './sockets/map';
import { roomSubscription } from './sockets/room';
import { hooks } from './symbols';
import { Socket } from 'net';
const { allowGuestAccess } = config.backend;

declare module '.' {
	interface Context {
		upgrade?: (fn: (req: IncomingMessage, socket: Duplex, head: Buffer) => void | Promise<void>) => Promise<void>;
	}
}

type SubscriptionInstance = {
	context: BackendContext;
	user?: string;
	send: (jsonEncodedMessage: string) => void;
};
export type SubscriptionEndpoint = {
	pattern: RegExp;
	subscribe: (this: SubscriptionInstance, parameters: Record<string, string>) => Promise<Effect> | Effect;
};

// Used to mark HTTP upgrade requests
class FakeResponse extends ServerResponse {
	constructor(
		public readonly upgradeSocket: Duplex,
		public readonly head: Buffer,
	) {
		super(new IncomingMessage(new Socket));
	}
}

const prefix = '/socket';

/**
 * Allows HTTP upgrade requests to be routed through Koa middleware
 */
export function installUpgradeHandlers(koa: Koa<State, Context>, httpServer: Server) {

	// Install HTTP upgrade handler to forward fake requests to Koa
	const callback = koa.callback();
	httpServer.on('upgrade', (request, socket, head) => {
		const fakeResponse: any = new FakeResponse(socket, head);
		fakeResponse.head = head;
		fakeResponse.socket = socket;
		callback(request, fakeResponse);
	});

	koa.use(async(context, next) => {
		// Detect and handle FakeResponse
		const res = context.res;
		if (res instanceof FakeResponse) {
			context.upgrade = fn => {
				context.respond = false;
				return Promise.resolve(fn(context.req, res.upgradeSocket, res.head));
			};
		}
		// Invoke remaining middleware
		await next();
		// Check to see if it was handled
		if (res instanceof FakeResponse) {
			if (context.respond !== false) {
				context.respond = false;
				res.upgradeSocket.end('HTTP/1.1 404 Not Found\r\n\r\n');
			}
		}
	});
}

export function installSocketHandlers(koa: Koa<State, Context>, context: BackendContext) {
	// SockJS aggressively injects its listeners at the front of the queue, so we pass it a fake HTTP
	// server to have better control over the event flow.
	const httpDelegate = new EventEmitter as Server;
	const socketServer = sockjs.createServer({
		prefix,
		log: () => {},
	});
	socketServer.installHandlers(httpDelegate);

	// Hook into Koa
	koa.use(async(context, next) => {
		// Let mods run first
		await next();
		if (context.path === prefix || context.path.startsWith(`${prefix}/`)) {
			// Pass off to SockJS
			if (context.upgrade) {
				await context.upgrade((req, socket, head) => void httpDelegate.emit('upgrade', req, socket, head));
			} else {
				context.respond = false;
				httpDelegate.emit('request', context.req, context.res);
			}
		}
	});

	// The rest is regular WebSocket code, no more dragons
	const handlers = [ ...CodeSubscriptions, ...ConsoleSubscriptions, mapSubscription, roomSubscription, ...hooks.map('subscription') ];
	socketServer.on('connection', connection => {
		// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
		if (!connection) {
			// Sometimes Sockjs gives us dead connections on restart..
			return;
		}

		// Fish `request` object out of internal structure
		const session = (connection as any)._session;
		const request: IncomingMessage | undefined =
			// WebSocket
			session.recv.ws?._driver._request ??
			// XHR
			session.recv.request;

		// Set up subscription bookkeeping for this socket
		let user: string | undefined;
		const subscriptions = new Map<string, Promise<Effect>>();
		function close() {
			for (const [ name, unlistener ] of subscriptions) {
				subscriptions.delete(name);
				unlistener.then(unlistener => unlistener(), () => {});
			}
			connection.close();
		}

		connection.write(`time ${Date.now()}`);
		connection.write('protocol 14');
		connection.on('data', message => {
			const authMessage = /^auth (?<token>.+)$/.exec(message);

			if (authMessage) {
				(async() => {
					// If this socket has an X-Token header it will taken priority over the auth message. This
					// header is probably never sent by the client but authentication middleware can stick it
					// on the request object.
					const token = `${request?.headers['x-token'] ?? authMessage.groups!.token}`;
					if (token === 'guest') {
						if (allowGuestAccess) {
							connection.write('auth ok guest');
						} else {
							connection.write('auth failed');
						}
					} else {
						const id = await checkToken(token);
						if (id !== undefined && /^[a-f0-9]+$/.test(id)) {
							// Token for a real user
							if (user !== undefined && id !== user) {
								close();
								return;
							}
							user = id;
							connection.write(`auth ok ${await makeToken(id)}`);
						} else {
							// Some other auth token
							connection.write('auth failed');
						}
					}
				})().catch(console.error);
			} else {
				// Subscription to channel
				const subscriptionRequest = /^subscribe (?<name>.+)$/.exec(message);
				if (subscriptionRequest) {
					// Can't subscribe if you're not logged in
					if (!allowGuestAccess && user === undefined) {
						return;
					}

					// Execute subscription request
					const { name } = subscriptionRequest.groups!;
					for (const handler of handlers) {
						const result = handler.pattern.exec(name);
						if (result) {
							// Don't let subscriptions collide
							if (subscriptions.has(name)) {
								return;
							}
							const encodedName = JSON.stringify(name);
							const instance: SubscriptionInstance = {
								context,
								user,
								send: jsonEncodedMessage => connection.write(`[${encodedName},${jsonEncodedMessage}]`),
							};
							const subscription = Promise.resolve(handler.subscribe.call(instance, result.groups!));
							subscriptions.set(name, subscription);
							subscription.catch(error => {
								console.error(error);
								close();
							});
						}
					}
				}

				// Unsubscription from channel
				const unsubscriptionRequest = /^unsubscribe (?<name>.+)$/.exec(message);
				if (unsubscriptionRequest) {
					const { name } = unsubscriptionRequest.groups!;
					const unlistener = subscriptions.get(name);
					if (unlistener) {
						subscriptions.delete(name);
						unlistener.then(unlistener => unlistener(), console.error);
					}
				}
			}
		});

		connection.on('close', close);
	});
	return socketServer;
}
