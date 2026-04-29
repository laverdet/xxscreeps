import type { PubSubListener, PubSubProvider, PubSubSubscription } from '../provider.js';
import type { Worker } from 'node:worker_threads';
import { isTopThread } from 'xxscreeps/engine/service/index.js';
import { Deferred, mustNotReject } from 'xxscreeps/utility/async.js';
import { Effect } from 'xxscreeps/utility/types.js';
import { getOrSet } from 'xxscreeps/utility/utility.js';
import { registerStorageProvider } from '../register.js';
import { DisposableLocalPayloadPort, LocalPayloadPort, makeSocketPortConnection, makeSocketPortListener, makeWorkerPortConnection, makeWorkerPortListener } from './port.js';
import { getResponderSocketPath, isSiblingProcess } from './responder.js';

type Listener = (message: string) => void;

interface PublishMessage {
	type: 'publish';
	key: string;
	message: string;
	id?: number;
}
interface SubscriptionRequest {
	type: 'subscribe';
	key: string;
	id: number;
}
interface UnsubscriptionRequest {
	type: 'unsubscribe';
	id: number;
}
interface AckMessage {
	type: 'ack';
}

type Sends = AckMessage | PublishMessage;
type Receives = PublishMessage | SubscriptionRequest | UnsubscriptionRequest;

const providersByName = new Map<string, { instance: LocalPubSubProviderParent; refs: number } | undefined>();
registerStorageProvider('local', 'pubsub', async url => {
	if (isTopThread && !await isSiblingProcess()) {
		const id = `${url}`;
		const info = await async function() {
			const info = providersByName.get(id);
			if (info) {
				return info;
			} else {
				if (providersByName.has(id)) {
					throw new Error(`Pubsub: ${id} already exists`);
				}
				providersByName.set(id, undefined as never);
				const instance = await LocalPubSubProviderParent.create(url);
				const info = { instance, refs: 0 };
				providersByName.set(id, info);
				return info;
			}
		}();
		++info.refs;
		const effect: Effect = () => {
			if (--info.refs === 0) {
				providersByName.delete(id);
				info.instance.disconnect();
			}
		};
		return [ effect, info.instance ];
	} else {
		const instance = await LocalPubSubProviderClient.connect(url);
		return [ () => instance.disconnect(), instance ];
	}
});

interface SubscriptionReference {
	send: (message: string) => void;
}

class ParentSubscription implements PubSubSubscription, SubscriptionReference {
	private readonly listener;
	private readonly key;
	private readonly provider;

	constructor(listener: Listener, key: string, provider: LocalPubSubProviderParent) {
		this.listener = listener;
		this.key = key;
		this.provider = provider;
	}

	async publish(message: string) {
		this.provider.send(this.key, message, this);
		return Promise.resolve();
	}

	send(message: string) {
		this.listener(message);
	}
}

class WorkerSubscriptionReference implements SubscriptionReference {
	readonly key;
	private readonly port;

	constructor(port: LocalPayloadPort<PublishMessage, unknown>, key: string) {
		this.port = port;
		this.key = key;
	}

	close() {
	}

	send(message: string) {
		this.port.send({ type: 'publish', key: this.key, message });
	}
}

/**
 * Provider created within the top thread
 */
class LocalPubSubProviderParent implements PubSubProvider {
	private readonly disposable = new AsyncDisposableStack();
	private readonly subscriptionsByKey = new Map<string, Set<SubscriptionReference>>();

	static async create(url: URL) {
		const instance = new LocalPubSubProviderParent();
		const socket = getResponderSocketPath(url);
		if (socket) {
			instance.disposable.use(await makeSocketPortListener<Sends, Receives>(socket, port => {
				instance.handle(port);
			}));
		}
		return instance;
	}

	// Install listener on newly created workers. Called from the host/parent thread.
	static initializeWorker(this: void, worker: Worker) {
		if (isTopThread) {
			makeWorkerPortListener<Sends, Receives>(worker, name => {
				const provider = providersByName.get(name)?.instance;
				if (provider) {
					return port => provider.handle(port);
				}
			});
		}
	}

	disconnect() {
		mustNotReject(this.disposable.disposeAsync());
	}

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
		const sources = getOrSet(this.subscriptionsByKey, key, () => new Set());
		sources.add(subscription);
		return [ () => {
			if (sources.size === 1) {
				this.subscriptionsByKey.delete(key);
			} else {
				sources.delete(subscription);
			}
		}, subscription ] as const;
	}

	private handle(port: LocalPayloadPort<Sends, Receives>) {
		const subscriptionsById = new Map<number, WorkerSubscriptionReference>();
		mustNotReject((async () => {
			for await (const message of port.messages) {
				switch (message.type) {
					case 'publish': {
						const { id } = message;
						const source = id === undefined ? undefined : subscriptionsById.get(id);
						this.send(message.key, message.message, source);
						port.send({ type: 'ack' });
						break;
					}

					case 'subscribe': {
						const { key } = message;
						const ref = new WorkerSubscriptionReference(port, key);
						subscriptionsById.set(message.id, ref);
						getOrSet(this.subscriptionsByKey, key, () => new Set()).add(ref);
						port.send({ type: 'ack' });
						break;
					}

					case 'unsubscribe': {
						const source = subscriptionsById.get(message.id)!;
						const sources = this.subscriptionsByKey.get(source.key)!;
						if (sources.size === 1) {
							this.subscriptionsByKey.delete(source.key);
						} else {
							sources.delete(source);
						}
					}
				}
			}
		})());
	}
}

/**
 * Provider within a worker or sibling process
 * @internal
 */
export class LocalPubSubProviderClient implements PubSubProvider {
	private id = 0;
	private readonly subscriptionsByKey = new Map<string, Set<ClientSubscription>>();
	private readonly syn: Deferred[] = [];
	private readonly port;

	constructor(port: DisposableLocalPayloadPort<Receives, Sends>) {
		this.port = port;
		mustNotReject((async () => {
			for await (const message of port.messages) {
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
			}
		})());
	}

	static async connect(url: URL) {
		if (isTopThread) {
			const path = getResponderSocketPath(url);
			if (!path) {
				throw new Error('No responder configured');
			}
			return new LocalPubSubProviderClient(await makeSocketPortConnection<Receives, Sends>(path));
		} else {
			return new LocalPubSubProviderClient(await makeWorkerPortConnection<Receives, Sends>(`${url}`));
		}
	}

	disconnect() {
		mustNotReject(this.port[Symbol.asyncDispose]());
		this.syn.forEach(deferred => deferred.reject(new Error('PubSub hung up')));
	}

	publish(key: string, message: string) {
		return this.send(key, message);
	}

	async send(key: string, message: string, source?: ClientSubscription) {
		// Send message to top thread and wait for ack
		const deferred = new Deferred();
		this.syn.push(deferred);
		this.port.send({ type: 'publish', key, message });
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
		const deferred = new Deferred();
		this.syn.push(deferred);
		this.port.send({ type: 'subscribe', key, id });

		// Wait for response before returning
		await deferred.promise;
		const subscription = new ClientSubscription(listener, key, this);
		const subscriptions = getOrSet(this.subscriptionsByKey, key, () => new Set());
		subscriptions.add(subscription);
		const effect: Effect = () => {
			if (subscriptions.size === 1) {
				this.subscriptionsByKey.delete(key);
			} else {
				subscriptions.delete(subscription);
			}
			this.port.send({ type: 'unsubscribe', id });
		};
		return [ effect, subscription ] as const;
	}
}

/**
 * Active subscription to a message channel
 */
class ClientSubscription implements PubSubSubscription {
	readonly listener;
	private readonly key;
	private readonly provider;

	constructor(listener: Listener, key: string, provider: LocalPubSubProviderClient) {
		this.listener = listener;
		this.key = key;
		this.provider = provider;
	}

	async publish(message: string) {
		return this.provider.send(this.key, message, this);
	}
}

export const initializeWorker = LocalPubSubProviderParent.initializeWorker;
