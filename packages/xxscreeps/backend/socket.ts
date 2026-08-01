import type { BackendContext } from './context.js';
import type Koa from 'koa';
import type { Server } from 'node:http';
import type { Duplex } from 'node:stream';
import type { Connection } from 'sockjs';
import type { Effect } from 'xxscreeps/utility/types.js';
import type { Context, State } from 'xxscreeps:backend';
import { EventEmitter } from 'node:events';
import { IncomingMessage, ServerResponse } from 'node:http';
import { Socket } from 'node:net';
import sockjs from 'sockjs';
import { config } from 'xxscreeps/config/index.js';
import { Fn } from 'xxscreeps/functional/fn.js';
import { checkToken, makeToken } from './auth/token.js';
import { CodeSubscriptions } from './sockets/code.js';
import { ConsoleSubscriptions } from './sockets/console.js';
import { mapSubscription } from './sockets/map.js';
import { roomSubscription } from './sockets/room.js';
import { hooks } from './symbols.js';

const { allowGuestAccess } = config.backend;

declare module 'xxscreeps:backend' {
	interface Context {
		upgrade?: (fn: (req: IncomingMessage, socket: Duplex, head: Buffer) => void | Promise<void>) => Promise<void>;
	}
}

type SubscriptionInstance = {
	context: BackendContext;
	user: string | undefined;
	send: (jsonEncodedMessage: string) => void;
};
export type SubscriptionEndpoint = {
	pattern: RegExp;
	subscribe: (this: SubscriptionInstance, parameters: Record<string, string>) => Promise<Effect> | Effect;
};

/**
 * One subscription of a socket. A channel is addressed by its name alone, so a name must never be
 * held by two of them at once. Tearing one down is asynchronous, which is why the name stays taken
 * until the old subscription has finished stopping.
 */
interface Subscription {
	/** Resolves once it is listening, to the effect which stops it. */
	effect: Promise<Effect>;
	/** Drops anything it sends from here on. Applied the moment the name is given up. */
	mute: Effect;
	/** Set once it has been unsubscribed; resolves once its listener is gone. */
	stopped?: Promise<void>;
}

// Undocumented SockJS internals
interface ConnectionWithSession extends Connection {
	_session: {
		recv?: {
			ws?: {
				_driver: { _request: IncomingMessage };
			};
			request?: IncomingMessage;
		};
	};
}

// Used to mark HTTP upgrade requests
class FakeResponse extends ServerResponse {
	readonly head;
	override readonly socket: Socket;

	constructor(upgradeSocket: Duplex, head: Buffer) {
		super(new IncomingMessage(new Socket()));
		// @ts-expect-error
		this.socket = upgradeSocket;
		this.head = head;
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
		const fakeResponse = new FakeResponse(socket, head);
		callback(request, fakeResponse).catch(error => {
			console.error(error);
			socket.destroy();
		});
	});

	koa.use(async (context, next) => {
		// Detect and handle FakeResponse
		const res = context.res;
		if (res instanceof FakeResponse) {
			context.upgrade = fn => {
				context.respond = false;
				return Promise.resolve(fn(context.req, res.socket, res.head));
			};
		}
		// Invoke remaining middleware
		await next();
		// Check to see if it was handled
		if (res instanceof FakeResponse) {
			if (context.respond !== false) {
				context.respond = false;
				res.socket.end('HTTP/1.1 404 Not Found\r\n\r\n');
			}
		}
	});
}

export function installSocketHandlers(koa: Koa<State, Context>, context: BackendContext) {
	// Track pending subscription teardowns for graceful shutdown
	const pendingTeardowns = new Set<Promise<void>>();

	// SockJS aggressively injects its listeners at the front of the queue, so we pass it a fake HTTP
	// server to have better control over the event flow.
	const httpDelegate = new EventEmitter() as Server;
	const socketServer = sockjs.createServer({
		prefix,
		log: () => {},
	});
	socketServer.installHandlers(httpDelegate);

	// Hook into Koa
	koa.use(async (context, next) => {
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
	socketServer.on('connection', (connection: ConnectionWithSession | null) => {

		if (!connection) {
			// Sometimes Sockjs gives us dead connections on restart..
			return;
		}

		// Fish `request` object out of internal structure
		const session = connection._session;
		const request: IncomingMessage | undefined =
			// WebSocket
			session.recv?.ws?._driver._request ??
			// XHR
			session.recv?.request;

		// Set up subscription bookkeeping for this socket
		let user: string | undefined;

		const subscriptions = new Map<string, Subscription>();

		/** Stops a subscription and gives up its name. Idempotent: the same stop is handed back. */
		const stop = (name: string, subscription: Subscription) => subscription.stopped ?? function() {
			// Tearing the listener down doesn't reach a callback which is already running, so the
			// subscription is muted here instead of when the effect eventually resolves.
			subscription.mute();
			const stopped = async function() {
				try {
					(await subscription.effect)();
				} catch (error) {
					console.error(error);
				} finally {
					// A resubscribe may already have claimed the name, and that one is not ours to drop.
					if (subscriptions.get(name) === subscription) {
						subscriptions.delete(name);
					}
					// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
					pendingTeardowns.delete(stopped!);
				}
			}();
			subscription.stopped = stopped;
			pendingTeardowns.add(stopped);
			return stopped;
		}();

		const close = () => {
			void async function() {
				await Fn.mapAwait(subscriptions, ([ name, subscription ]) => stop(name, subscription));
			}();
			connection.close();
		};

		connection.write(`time ${Date.now()}`);
		connection.write('protocol 14');
		connection.on('data', message => {
			const authMessage = /^auth (?<token>.+)$/.exec(message);

			if (authMessage) {
				(async () => {
					// If this socket has an X-Token header it will take priority over the auth message. This
					// header is never sent by the client but the authentication middleware can stick it on
					// the request object.
					const token = String(request?.headers['x-token'] ?? authMessage.groups!.token);
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
						const result = handler.pattern.exec(name!);
						if (result) {
							// Don't let subscriptions collide
							const previous = subscriptions.get(name!);
							if (previous !== undefined && previous.stopped === undefined) {
								return;
							}
							const encodedName = JSON.stringify(name);
							let muted = false as boolean;
							const instance: SubscriptionInstance = {
								context,
								user,
								send: jsonEncodedMessage => {
									if (!muted) {
										connection.write(`[${encodedName},${jsonEncodedMessage}]`);
									}
								},
							};
							// The client gives a channel up and claims it again as it moves between rooms, so a
							// resubscribe waits the old subscription out rather than running alongside it.
							const subscription: Subscription = {
								effect: async function() {
									await previous?.stopped;
									return handler.subscribe.call(instance, result.groups!);
								}(),
								mute: () => { muted = true; },
							};
							subscriptions.set(name!, subscription);
							subscription.effect.catch(error => {
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
					const subscription = subscriptions.get(name!);
					if (subscription !== undefined) {
						void stop(name!, subscription);
					}
				}
			}
		});

		connection.on('close', close);
	});
	return {
		flush: () => Promise.all(pendingTeardowns),
	};
}
