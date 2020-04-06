import type { Server } from 'http';
import sockjs from 'sockjs';
import { checkToken, makeToken } from './auth/token';
import { BackendContext } from './context';
import { CodeSubscriptions } from './sockets/code';
import { ConsoleSubscription } from './sockets/console';
import { mapSubscription } from './sockets/map';
import { roomSubscription } from './sockets/room';

const socketServer = sockjs.createServer({
	prefix: '/socket',
	log: () => {},
});
const handlers = [ ...CodeSubscriptions, ConsoleSubscription, mapSubscription, roomSubscription ];

type Unlistener = () => void;
type SubscriptionInstance = {
	context: BackendContext;
	user: string;
	send: (jsonEncodedMessage: string) => void;
};
export type SubscriptionEndpoint = {
	pattern: RegExp;
	subscribe: (this: SubscriptionInstance, parameters: Record<string, string>) => Promise<Unlistener> | Unlistener;
};

export function installSocketHandlers(httpServer: Server, context: BackendContext) {
	socketServer.installHandlers(httpServer);
	socketServer.on('connection', connection => {
		let user: string;
		const subscriptions = new Map<string, Promise<Unlistener>>();
		function close() {
			for (const [ name, unlistener ] of subscriptions) {
				subscriptions.delete(name);
				unlistener.then(unlistener => unlistener(), () => {});
			}
		}

		connection.write(`time ${Date.now()}`);
		connection.write('protocol 14');
		connection.on('data', message => {
			const authMessage = /^auth (?<token>.+)$/.exec(message);

			if (authMessage) {
				(async() => {
					const { token } = authMessage.groups!;
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
				})().catch(console.error);
			} else {
				// Subscription to channel
				const subscriptionRequest = /^subscribe (?<name>.+)$/.exec(message);
				if (subscriptionRequest) {
					// Can't subscribe if you're not logged in
					if (user === undefined) {
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
						unlistener.then(unlistener => unlistener(), () => {});
					}
				}
			}
		});

		connection.on('close', close);
	});
}
