import type { Server } from 'http';
import sockjs from 'sockjs';
import { BackendContext } from './context';
import { mapSubscription } from './sockets/map';
import { roomSubscription } from './sockets/room';

const socketServer = sockjs.createServer({
	prefix: '/socket',
	log: () => {},
});
const handlers = [ mapSubscription, roomSubscription ];

type Unlistener = () => void;
type SubscriptionInstance = {
	context: BackendContext;
	send: (jsonEncodedMessage: string) => void;
};
export type SubscriptionEndpoint = {
	pattern: RegExp;
	subscribe: (this: SubscriptionInstance, parameters: Record<string, string>) => Promise<Unlistener> | Unlistener;
};

export function installSocketHandlers(httpServer: Server, context: BackendContext) {
	socketServer.installHandlers(httpServer);
	socketServer.on('connection', connection => {
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
			if (/^auth /.exec(message)) {
				connection.write('auth ok 123');
			} else {
				// Subscription to channel
				const subscriptionRequest = /^subscribe (?<name>.+)$/.exec(message);
				if (subscriptionRequest) {
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
