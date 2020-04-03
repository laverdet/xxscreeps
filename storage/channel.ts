import { Worker, isMainThread, parentPort } from 'worker_threads';
import { makeResolver, staticCast } from '~/lib/utility';

type Listener<Message> = (message: Message) => void;
type InternalListener<Message> = (message: Message, id?: string) => void;
type Subscription<Message = any> = {
	readonly name: string;
	readonly subscription: InternalListener<Message>;
};

type ChannelNotification = {
	type: 'channelMessage';
	name: string;
	payload: any;
	publisher?: string;
};
type SubscriptionRequest = {
	type: 'channelSubscribe';
	name: string;
	id: string;
};
type UnsubscribeRequest = {
	type: 'channelUnsubscribe';
	name: string;
	id: string;
};
type SubscriptionConfirmation = {
	type: 'channelSubscribed';
	id: string;
};

type UnknownMessage = { type: null };
type MasterMessage = ChannelNotification | SubscriptionConfirmation | UnknownMessage;
type WorkerMessage = ChannelNotification | SubscriptionRequest | UnsubscribeRequest | UnknownMessage;

/**
 * Utility functions to manage channels in a single isolate
 */
const channelsByName = new Map<string, Set<Subscription>>();

function connect(channel: Subscription) {
	const channels = channelsByName.get(channel.name);
	if (channels) {
		channels.add(channel);
	} else {
		channelsByName.set(channel.name, new Set([ channel ]));
	}
}

function disconnect(channel: Subscription) {
	const channels = channelsByName.get(channel.name)!;
	channels.delete(channel);
	if (channels.size === 0) {
		channelsByName.delete(channel.name);
	}
}

function publish(name: string, id: string | undefined, message: any) {
	const channels = channelsByName.get(name);
	if (channels !== undefined) {
		for (const channel of channels) {
			channel.subscription(message, id);
		}
	}
}

/**
 * Communication channels. This would probably be implemented in redis or something.
 */
export abstract class Channel<Message> {
	readonly subscription: InternalListener<Message>;
	protected readonly id = `${Math.floor(Math.random() * 2 ** 52)}`;
	private didDisconnect = false;
	private readonly disconnectListeners = new Set<() => void>();
	private readonly listeners = new Set<(message: Message) => void>();

	abstract publish(message: Message): void;

	protected constructor(readonly name: string) {
		this.subscription = (message, id) => {
			if (this.id !== id) {
				for (const listener of this.listeners) {
					listener(message);
				}
			}
		};
	}

	// Connect to a message channel
	static connect<Message>(name: string): Promise<Channel<Message>> {
		return (isMainThread ? LocalChannel.connect : WorkerChannel.connect)(name);
	}

	// Publish to a message channel without subscribing to it
	static publish<Message>(name: string, message: Message): void {
		return (isMainThread ? LocalChannel.publish : WorkerChannel.publish)(name, message);
	}

	// Called once per worker on start up
	static initializeWorker(worker: Worker) {
		return LocalChannel.initializeWorker(worker);
	}

	// This should also be overridden
	disconnect() {
		for (const listener of this.disconnectListeners) {
			listener();
		}
		this.didDisconnect = true;
	}

	// Add a new listener to this channel
	listen(listener: Listener<Message>) {
		if (this.listeners.has(listener)) {
			throw new Error('Duplicate listener');
		}
		this.listeners.add(listener);
		return () => {
			if (!this.listeners.has(listener)) {
				throw new Error('Unlisten called more than once');
			}
			this.listeners.delete(listener);
		};
	}

	// Iterates over all messages in a `for await` loop
	async *[Symbol.asyncIterator](): AsyncGenerator<Message> {
		// Create listener to save incoming messages
		let resolver: Resolver<Message | undefined> | undefined;
		const queue: Message[] = [];
		const unlisten = this.listen(message => {
			if (resolver) {
				resolver.resolve(message);
				resolver = undefined;
			} else {
				queue.push(message);
			}
		});
		try {
			do {
				// Immediately yield any queued messages
				while (queue.length !== 0) {
					yield queue.shift()!;
					if (this.didDisconnect) {
						return;
					}
				}
				// Make resolver to await on
				let promise: Promise<Message | undefined>;
				[ promise, resolver ] = makeResolver<Message | undefined>();
				const disconnectListener = () => resolver!.resolve();
				this.disconnectListeners.add(disconnectListener);
				// Wait for new messages
				const value = await promise;
				this.disconnectListeners.delete(disconnectListener);
				// Check for `undefined` from disconnect listener
				if (value === undefined) {
					return;
				}
				// Yield back to loop
				yield value;
				if (this.didDisconnect) {
					return;
				}
			} while (true);
		} finally {
			// Clean up listeners when it's all done
			unlisten();
		}
	}
}

/**
 * Channels created within the master process
 */
class LocalChannel<Message> extends Channel<Message> {

	static connect<Message>(name: string) {
		const channel = new LocalChannel<Message>(name);
		connect(channel);
		return Promise.resolve(channel);
	}

	// Install listener on newly created workers. Called from the host/parent thread.
	static initializeWorker(worker: Worker) {
		const channelsIdsByName = new Map<string, Set<string>>();
		const localChannelInstances = new Map<string, Subscription>();
		worker.on('message', (message: WorkerMessage) => {
			switch (message.type) {
				case 'channelMessage':
					// Child is send message to the main thread
					return publish(message.name, message.publisher, message.payload);

				case 'channelSubscribe': {
					const channelIds = channelsIdsByName.get(message.name);
					if (channelIds) {
						// This worker is already subscribed to this channel.. just add another local reference
						channelIds.add(message.id);
					} else {
						// Set up a new subscription for this worker
						const { name } = message;
						const channelIds = new Set([ message.id ]);
						channelsIdsByName.set(name, channelIds);
						const channel: Subscription = {
							name,
							subscription: (message, id) => {
								if (id === undefined || channelIds.size > 1 || !channelIds.has(id)) {
									worker.postMessage(staticCast<MasterMessage>({
										type: 'channelMessage',
										name,
										payload: message,
										publisher: id,
									}));
								}
							},
						};
						connect(channel);
						localChannelInstances.set(name, channel);
					}
					// Send notification to child that the subscription is ready
					worker.postMessage(staticCast<MasterMessage>({
						type: 'channelSubscribed',
						id: message.id,
					}));
					break;
				}

				case 'channelUnsubscribe': {
					const { name } = message;
					const channelIds = channelsIdsByName.get(name)!;
					channelIds.delete(message.id);
					if (channelIds.size === 0) {
						const channel = localChannelInstances.get(name)!;
						localChannelInstances.delete(name);
						disconnect(channel);
					}
					break;
				}

				default:
			}
		});

		// If the worker exits ungracefully then clean up all dangling subscriptions
		worker.on('exit', () => {
			for (const channel of localChannelInstances.values()) {
				disconnect(channel);
			}
			channelsIdsByName.clear();
			localChannelInstances.clear();
		});

		return worker;
	}

	static publish<Message>(name: string, message: Message) {
		publish(name, undefined, message);
	}

	disconnect() {
		super.disconnect();
		disconnect(this);
	}

	publish(message: Message) {
		publish(this.name, this.id, message);
	}
}

/**
 * Channels within a worker_thread
 */
class WorkerChannel<Message> extends Channel<Message> {
	private static didInit = false;
	private static readonly subscribedChannels =
		new Map<string, { count: number; connected: Promise<any> }>();

	// Install listener for all channels in this thread
	private static initializeThisWorker() {
		if (WorkerChannel.didInit) {
			return;
		}
		WorkerChannel.didInit = true;
		parentPort!.on('message', (message: MasterMessage) => {
			if (message.type === 'channelMessage') {
				publish(message.name, message.publisher, message.payload);
			}
		});
	}

	static async connect<Message>(name: string) {
		WorkerChannel.initializeThisWorker();
		// If there's already a channel connected there's no need to send another notification to the
		// parent thread
		const channel = new WorkerChannel<Message>(name);
		const existing = WorkerChannel.subscribedChannels.get(name);
		if (existing) {
			++existing.count;
			await existing.connected;
			return channel;
		}
		// Send connection notification to parent
		const channelPromise = new Promise<WorkerChannel<Message>>(resolve => {
			const subscribeListener = (message: MasterMessage) => {
				if (message.type === 'channelSubscribed' && message.id === channel.id) {
					parentPort!.removeListener('channelMessage', subscribeListener);
					connect(channel);
					resolve(channel);
				}
			};
			parentPort!.on('message', subscribeListener);
			parentPort!.postMessage(staticCast<WorkerMessage>({
				type: 'channelSubscribe',
				name,
				id: channel.id,
			}));
		});
		WorkerChannel.subscribedChannels.set(name, { count: 1, connected: channelPromise });
		return channelPromise;
	}

	static publish<Message>(name: string, message: Message) {
		parentPort!.postMessage(staticCast<WorkerMessage>({
			type: 'channelMessage',
			name,
			payload: message,
		}));
	}

	disconnect() {
		super.disconnect();
		// I think this is free of race conditions?
		const existing = WorkerChannel.subscribedChannels.get(this.name)!;
		if (--existing.count === 0) {
			WorkerChannel.subscribedChannels.delete(this.name);
			disconnect(this);
			parentPort!.postMessage(staticCast<WorkerMessage>({
				type: 'channelUnsubscribe',
				name: this.name,
				id: this.id,
			}));
		}
	}

	publish(message: Message) {
		parentPort!.postMessage(staticCast<WorkerMessage>({
			type: 'channelMessage',
			name: this.name,
			payload: message,
			publisher: this.id,
		}));
	}
}
