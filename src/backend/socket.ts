import type { Server } from 'http';
import type { Effect } from 'xxscreeps/utility/types';
import type { BackendContext } from './context';
import sockjs from 'sockjs';
import config from 'xxscreeps/config';
import { checkToken, makeToken } from './auth/token';
import { CodeSubscriptions } from './sockets/code';
import { ConsoleSubscriptions } from './sockets/console';
import { mapSubscription } from './sockets/map';
import { roomSubscription } from './sockets/room';
const { allowGuestAccess } = config.backend;

const socketServer = sockjs.createServer({
	prefix: '/socket',
	log: () => {},
});
const handlers = [ ...CodeSubscriptions, ...ConsoleSubscriptions, mapSubscription, roomSubscription ];

type SubscriptionInstance = {
	context: BackendContext;
	user?: string;
	send: (jsonEncodedMessage: string) => void;
};
export type SubscriptionEndpoint = {
	pattern: RegExp;
	subscribe: (this: SubscriptionInstance, parameters: Record<string, string>) => Promise<Effect> | Effect;
};

export function installSocketHandlers(httpServer: Server, context: BackendContext) {
	socketServer.installHandlers(httpServer);
	socketServer.on('connection', connection => {
		// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
		if (!connection) {
			// Sometimes Sockjs gives us dead connections on restart..
			return;
		}
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
					const { token } = authMessage.groups!;
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
