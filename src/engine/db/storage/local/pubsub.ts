import type { MessagePort, Worker } from 'worker_threads';
import type { PubSubListener, PubSubProvider, PubSubSubscription } from '../provider';
import { MessageChannel, parentPort } from 'worker_threads';
import { Deferred, listen } from 'xxscreeps/utility/async';
import { getOrSet, staticCast } from 'xxscreeps/utility/utility';
import { isTopThread } from 'xxscreeps/utility/worker';
import { registerStorageProvider } from '..';

type Listener = (message: string) => void;

type ConnectionRequest = {
	type: 'pubsubConnect';
	name: string;
	port: MessagePort;
};
type ConnectedResponse = {
	type: 'connected';
};
type PublishMessage = {
	type: 'publish';
	key: string;
	message: string;
	id?: number;
};
type SubscriptionRequest = {
	type: 'subscribe';
	key: string;
	id: number;
};
type UnsubscriptionRequest = {
	type: 'unsubscribe';
	id: number;
};
type AckMessage = {
	type: 'ack';
};

type UnknownMessage = { type: null };

const providersByName = new Map<string, { instance: LocalPubSubProviderParent; refs: 0 }>();
registerStorageProvider('local', 'pubsub', async url => {
	if (isTopThread) {
		const id = `${url}`;
		const info = getOrSet(providersByName, id, () => ({
			instance: new LocalPubSubProviderParent,
			refs: 0,
		}));
		++info.refs;
		return [ () => {
			if (--info.refs === 0) {
				providersByName.delete(id);
				info.instance.disconnect();
			}
		}, info.instance ];
	} else {
		const instance = await LocalPubSubProviderWorker.connect(`${url}`);
		return [ () => instance.disconnect(), instance ];
	}
});

interface SubscriptionReference {
	send(message: string): void;
}

class ParentSubscription implements PubSubSubscription, SubscriptionReference {
	constructor(
		private readonly listener: Listener,
		private readonly key: string,
		private readonly provider: LocalPubSubProviderParent) {}

	async publish(message: string) {
		this.provider.send(this.key, message, this);
		return Promise.resolve();
	}

	send(message: string) {
		this.listener(message);
	}
}

class WorkerSubscriptionReference implements SubscriptionReference {
	constructor(
		private readonly port: MessagePort,
		public readonly key: string) {}

	close() {
		this.port.close();
	}

	send(message: string) {
		this.port.postMessage(staticCast<PublishMessage>({ type: 'publish', key: this.key, message }));
	}
}

/**
 * Provider created within the top thread
 */
class LocalPubSubProviderParent implements PubSubProvider {
	private readonly subscriptionsByKey = new Map<string, Set<SubscriptionReference>>();

	// Install listener on newly created workers. Called from the host/parent thread.
	static initializeWorker(worker: Worker) {
		if (isTopThread) {
			worker.on('message', (message: ConnectionRequest | UnknownMessage) => {
				if (message.type === 'pubsubConnect') {
					const provider = providersByName.get(message.name)?.instance;
					const { port } = message;
					if (provider) {
						const subscriptionsById = new Map<number, WorkerSubscriptionReference>();
						port.on('message', (message: PublishMessage | SubscriptionRequest | UnsubscriptionRequest) => {
							switch (message.type) {
								case 'publish': {
									const { id } = message;
									const source = id === undefined ? undefined : subscriptionsById.get(id);
									provider.send(message.key, message.message, source);
									port.postMessage(staticCast<AckMessage>({ type: 'ack' }));
									break;
								}

								case 'subscribe': {
									const { key } = message;
									const ref = new WorkerSubscriptionReference(port, key);
									subscriptionsById.set(message.id, ref);
									getOrSet(provider.subscriptionsByKey, key, () => new Set).add(ref);
									port.postMessage(staticCast<AckMessage>({ type: 'ack' }));
									break;
								}

								case 'unsubscribe': {
									const source = subscriptionsById.get(message.id)!;
									const sources = provider.subscriptionsByKey.get(source.key)!;
									if (sources.size === 1) {
										provider.subscriptionsByKey.delete(source.key);
									} else {
										sources.delete(source);
									}
								}
							}
						});
						message.port.postMessage(staticCast<ConnectedResponse>({
							type: 'connected',
						}));
					} else {
						message.port.close();
					}
				}
			});
		} else {
			// Forward message up to top thread
			worker.on('message', (message: ConnectionRequest | UnknownMessage) => {
				if (message.type === 'pubsubConnect') {
					parentPort!.postMessage(message, [ message.port ]);
				}
			});
		}
	}

	disconnect() {}

	publish(key: string, message: string) {
		this.send(key, message);
		return Promise.resolve();
	}

	send(key: string, message: string, source?: SubscriptionReference) {
		const subscriptions = this.subscriptionsByKey.get(key);
		if (subscriptions) {
			for (const subscription of subscriptions) {
				if (subscription !== source) {
					subscription.send(message);
				}
			}
		}
	}

	// eslint-disable-next-line @typescript-eslint/require-await
	async subscribe(key: string, listener: PubSubListener) {
		const subscription = new ParentSubscription(listener, key, this);
		const sources = getOrSet(this.subscriptionsByKey, key, () => new Set);
		sources.add(subscription);
		return [ () => {
			if (sources.size === 1) {
				this.subscriptionsByKey.delete(key);
			} else {
				sources.delete(subscription);
			}
		}, subscription ] as const;
	}
}

/**
 * Provider within a worker
 */
class LocalPubSubProviderWorker implements PubSubProvider {
	private id = 0;
	private readonly subscriptionsByKey = new Map<string, Set<WorkerSubscription>>();
	private readonly syn: Deferred[] = [];
	constructor(private readonly port: MessagePort) {
		port.on('message', (message: AckMessage | PublishMessage) => {
			switch (message.type) {
				case 'ack':
					this.syn.shift()!.resolve();
					break;

				case 'publish': {
					const subscriptions = this.subscriptionsByKey.get(message.key);
					if (subscriptions) {
						const payload = message.message;
						for (const subscription of subscriptions) {
							subscription.listener(payload);
						}
					}
				}
			}
		});
	}

	static connect(name: string) {
		return new Promise<LocalPubSubProviderWorker>((resolve, reject) => {
			// Create message channel and listen for response
			const channel = new MessageChannel;
			const port = channel.port1;
			port.once('message', (message: ConnectedResponse | UnknownMessage) => {
				if (message.type === 'connected') {
					closeEffect();
					resolve(new LocalPubSubProviderWorker(port));
				} else {
					reject(new Error(`PubSub provider ${name} sent weird ack`));
				}
			});

			// Failure handler
			const closeEffect = listen(port, 'close', () =>
				reject(new Error(`PubSub provider ${name} does not exist`)));

			// Send subscription request to parent
			parentPort!.postMessage(staticCast<ConnectionRequest>({
				type: 'pubsubConnect',
				name,
				port: channel.port2,
			}), [ channel.port2 ]);
		});
	}

	disconnect() {
		this.port.close();
		this.syn.forEach(deferred => deferred.reject(new Error('PubSub hung up')));
	}

	publish(key: string, message: string) {
		return this.send(key, message);
	}

	async send(key: string, message: string, source?: WorkerSubscription) {
		// Send message to top thread and wait for ack
		const deferred = new Deferred;
		this.syn.push(deferred);
		this.port.postMessage(staticCast<PublishMessage>({
			type: 'publish',
			key,
			message,
		}));
		await deferred.promise;
		// Forward message to local subscribers
		const subscriptions = this.subscriptionsByKey.get(key);
		if (subscriptions) {
			for (const subscription of subscriptions) {
				if (subscription !== source) {
					subscription.listener(message);
				}
			}
		}
	}

	async subscribe(key: string, listener: PubSubListener) {

		// Send subscription request
		const id = ++this.id;
		const deferred = new Deferred;
		this.syn.push(deferred);
		this.port.postMessage(staticCast<SubscriptionRequest>({
			type: 'subscribe',
			key,
			id,
		}));

		// Wait for response before returning
		await deferred.promise;
		const subscription = new WorkerSubscription(listener, key, this);
		const subscriptions = getOrSet(this.subscriptionsByKey, key, () => new Set);
		subscriptions.add(subscription);
		return [ () => {
			if (subscriptions.size === 1) {
				this.subscriptionsByKey.delete(key);
			} else {
				subscriptions.delete(subscription);
			}
			this.port.postMessage(staticCast<UnsubscriptionRequest>({
				type: 'unsubscribe',
				id,
			}));
		}, subscription ] as const;
	}
}

/**
 * Active subscription to a message channel
 */
class WorkerSubscription implements PubSubSubscription {
	constructor(
		public readonly listener: Listener,
		private readonly key: string,
		private readonly provider: LocalPubSubProviderWorker) {}

	async publish(message: string) {
		return this.provider.send(this.key, message, this);
	}
}

export const initializeWorker = LocalPubSubProviderParent.initializeWorker;
