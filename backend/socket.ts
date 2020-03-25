import type { Server } from 'http';
import sockjs from 'sockjs';
import { mapSubscription } from './sockets/map';
import { roomSubscription } from './sockets/room';

const socketServer = sockjs.createServer({
	prefix: '/socket',
	log: () => {},
});
const handlers = [ mapSubscription, roomSubscription ];

type Unlistener = () => void;
export type Subscription = {
	pattern: RegExp;
	subscribe: (connection: sockjs.Connection, user: string, parameters: any) => Promise<Unlistener> | Unlistener;
};

export function installSocketHandlers(httpServer: Server) {
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
							const subscription = Promise.resolve(handler.subscribe(connection, '', result.groups!));
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
