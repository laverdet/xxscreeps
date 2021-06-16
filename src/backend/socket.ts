import type Koa from 'koa';
import type { BackendContext } from './context';
import type { Context, State } from '.';
import type { Effect } from 'xxscreeps/utility/types';
import type { IncomingMessage, Server } from 'http';
import sockjs from 'sockjs';
import config from 'xxscreeps/config';
import { checkToken, makeToken } from './auth/token';
import { CodeSubscriptions } from './sockets/code';
import { ConsoleSubscriptions } from './sockets/console';
import { EventEmitter } from 'events';
import { mapSubscription } from './sockets/map';
import { roomSubscription } from './sockets/room';
import { hooks } from './symbols';
const { allowGuestAccess } = config.backend;

type SubscriptionInstance = {
	context: BackendContext;
	user?: string;
	send: (jsonEncodedMessage: string) => void;
};
export type SubscriptionEndpoint = {
	pattern: RegExp;
	subscribe: (this: SubscriptionInstance, parameters: Record<string, string>) => Promise<Effect> | Effect;
};

const prefix = '/socket';
function usesPrefix(path: string, prefix: string) {
	return path === prefix || path.startsWith(`${prefix}/`);
}

export function installSocketHandlers(koa: Koa<State, Context>, httpServer: Server, context: BackendContext) {
	// SockJS aggressively injects its listeners at the front of the queue, so we pass it a fake HTTP
	// server to have better control over the event flow.
	const httpDelegate = new EventEmitter as Server;
	const socketServer = sockjs.createServer({
		prefix,
		log: () => {},
	});
	socketServer.installHandlers(httpDelegate);

	// Install Koa handler
	koa.use(async(context, next) => {
		// Disable Koa response if this is a request to /socket
		const isSocket = usesPrefix(context.request.path, prefix);
		if (isSocket) {
			context.respond = false;
		}
		// Invoke remaining middleware
		await next();
		if (isSocket) {
			// Update state on request object as well, so that Koa middleware which authenticates will
			// carry over to the socket
			const token = await context.flushToken();
			if (token) {
				context.request.headers['x-token'] = token;
			}
			// Forward request to SockJS
			const head = (context.req as any).head;
			if (head) {
				delete (context.req as any).head;
				httpDelegate.emit('upgrade', context.req, context.res, head);
			} else {
				httpDelegate.emit('request', context.req, context.res);
			}
		}
	});

	// Install HTTP upgrade handler
	httpServer.on('upgrade', (request, socket, head) => {
		request.head = head;
		httpServer.emit('request', request, socket, head);
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
