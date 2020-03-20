import { Worker, isMainThread, parentPort } from 'worker_threads';
import { makeResolver } from '~/lib/resolver';
import { staticCast } from '~/lib/utility';

type Listener<Message> = (message: Message, fromThisChannel: boolean) => void;
type InternalListener<Message> = (message: Message, id?: string) => void;
type Subscription<Message> = {
	readonly name: string;
	readonly listener: InternalListener<Message>;
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
const channelsByName = new Map<string, Set<Subscription<any>>>();

function connect(channel: Subscription<any>) {
	const channels = channelsByName.get(channel.name);
	if (channels === undefined) {
		channelsByName.set(channel.name, new Set([ channel ]));
	} else {
		channels.add(channel);
	}
}

function disconnect(channel: Subscription<any>) {
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
			channel.listener(message, id);
		}
	}
}

/**
 * Communication channels. This would probably be implemented in redis or something.
 */
export abstract class Channel<Message> {
	protected readonly id = `${Math.floor(Math.random() * 2 ** 52)}`;
	readonly listener: InternalListener<Message>;
	protected readonly extraListeners = new Set<(message: Message) => void>();

	constructor(
		readonly name: string,
		listener?: Listener<Message>,
	) {
		this.listener = (message, id) => {
			listener?.(message, this.id === id);
			for (const listener of this.extraListeners) {
				listener(message);
			}
		};
	}

	static connect<Message>(name: string, listener?: Listener<Message>): Promise<Channel<Message>> {
		return (isMainThread ? LocalChannel.connect : WorkerChannel.connect)(name, listener);
	}

	static publish<Message>(name: string, message: Message): void {
		return (isMainThread ? LocalChannel.publish : WorkerChannel.publish)(name, message);
	}

	static initializeWorker(worker: Worker) {
		return LocalChannel.initializeWorker(worker);
	}

	abstract disconnect(): void;
	abstract publish(message: Message): void;

	async *[Symbol.asyncIterator](): AsyncGenerator<Message> {
		// Create listener to save incoming messages
		let resolver: Resolver<Message> | undefined;
		const queue: Message[] = [];
		const listener = (message: Message) => {
			if (resolver === undefined) {
				queue.push(message);
			} else {
				resolver.resolve(message);
				resolver = undefined;
			}
		};
		this.extraListeners.add(listener);
		try {
			do {
				// Immediately yield any queued messages
				while (queue.length !== 0) {
					yield queue.shift()!;
				}
				// Make resolver to await on
				let promise;
				[ promise, resolver ] = makeResolver<Message>();
				// Wait for new messages
				yield await promise;
			// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
			} while (true);
		} finally {
			// Clean up listeners when it's all done
			this.extraListeners.delete(listener);
		}
	}
}

/**
 * Channels created within the master process
 */
class LocalChannel<Message> extends Channel<Message> {

	// Install listener for channels in worker threads
	static initializeWorker(worker: Worker) {
		const channelsIdsByName = new Map<string, Set<string>>();
		const localChannelInstances = new Map<string, Subscription<any>>();
		worker.on('message', (message: WorkerMessage) => {
			switch (message.type) {
				case 'channelMessage':
					return publish(message.name, message.publisher, message.payload);

				case 'channelSubscribe': {
					const channelIds = channelsIdsByName.get(message.name);
					if (channelIds === undefined) {
						const { name } = message;
						const channel: Subscription<any> = {
							name,
							listener: (message: any, id?: string) => worker.postMessage(staticCast<MasterMessage>({
								type: 'channelMessage',
								name,
								payload: message,
								publisher: id,
							})),
						};
						connect(channel);
						localChannelInstances.set(message.name, channel);
						channelsIdsByName.set(message.name, new Set([ message.id ]));
					} else {
						channelIds.add(message.id);
					}
					worker.postMessage(staticCast<MasterMessage>({
						type: 'channelSubscribed',
						id: message.id,
					}));
					break;
				}

				case 'channelUnsubscribe': {
					const channelIds = channelsIdsByName.get(message.name)!;
					channelIds.delete(message.id);
					if (channelIds.size === 0) {
						const channel = localChannelInstances.get(message.name)!;
						localChannelInstances.delete(message.name);
						disconnect(channel);
					}
					break;
				}

				default:
			}
		});

		worker.on('exit', () => {
			for (const channels of localChannelInstances.values()) {
				disconnect(channels);
			}
			channelsIdsByName.clear();
			localChannelInstances.clear();
		});

		return worker;
	}

	static connect<Message>(name: string, listener?: Listener<Message>) {
		const channel = new LocalChannel<Message>(name, listener);
		connect(channel);
		return Promise.resolve(channel);
	}

	static publish<Message>(name: string, message: Message) {
		publish(name, undefined, message);
	}

	disconnect() {
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

	// Install listener for all channels in this thread
	static didInit = false;
	private static init() {
		if (this.didInit) {
			return;
		}
		this.didInit = true;
		parentPort!.on('message', (message: MasterMessage) => {
			if (message.type === 'channelMessage') {
				publish(message.name, message.publisher, message.payload);
			}
		});
	}

	static connect<Message>(name: string, listener?: Listener<Message>) {
		WorkerChannel.init();
		return new Promise<WorkerChannel<Message>>(resolve => {
			const channel = new WorkerChannel<Message>(name, listener);
			const subscribeListener = (message: any) => {
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
	}

	static publish<Message>(name: string, message: Message) {
		parentPort!.postMessage(staticCast<WorkerMessage>({
			type: 'channelMessage',
			name,
			payload: message,
		}));
	}

	disconnect() {
		disconnect(this);
		parentPort!.postMessage(staticCast<WorkerMessage>({
			type: 'channelUnsubscribe',
			name: this.name,
			id: this.id,
		}));
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
