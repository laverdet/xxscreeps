import { Worker, isMainThread, parentPort } from 'worker_threads';
import { staticCast } from '~/lib/static-cast';

type Listener<Message> = (message: Message, fromThisChannel: boolean) => void;
type InternalListener<Message> = (message: Message, id?: string) => void;
type Subscription<Message> = {
	readonly name: string;
	readonly listener: InternalListener<Message>;
};

type ChannelNotification = {
	type: 'message';
	name: string;
	payload: any;
	publisher?: string;
};
type SubscriptionRequest = {
	type: 'subscribe';
	name: string;
	id: string;
};
type UnsubscribeRequest = {
	type: 'unsubscribe';
	name: string;
	id: string;
};
type SubscriptionConfirmation = {
	type: 'subscribed';
	id: string;
};

type MasterMessage = ChannelNotification | SubscriptionConfirmation;
type WorkerMessage = ChannelNotification | SubscriptionRequest | UnsubscribeRequest;

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

	constructor(
		readonly name: string,
		listener: Listener<Message>,
	) {
		this.listener = (message, id) => listener(message, this.id === id);
	}

	static connect<Message>(name: string, listener: Listener<Message>): Promise<Channel<Message>> {
		this.connect = function() {
			if (isMainThread) {
				return LocalChannel.connect;
			} else {
				return WorkerChannel.connect;
			}
		}();
		return this.connect(name, listener);
	}

	static publish<Message>(name: string, message: Message): void {
		this.publish = function() {
			if (isMainThread) {
				return LocalChannel.publish;
			} else {
				return WorkerChannel.publish;
			}
		}();
		return this.publish(name, message);
	}

	static initializeWorker(worker: Worker) {
		return LocalChannel.initializeWorker(worker);
	}

	abstract disconnect(): void;
	abstract publish(message: Message): void;
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
				case 'message':
					return publish(message.name, message.publisher, message.payload);

				case 'subscribe': {
					const channelIds = channelsIdsByName.get(message.name);
					if (channelIds === undefined) {
						const { name } = message;
						const channel: Subscription<any> = {
							name,
							listener: (message: any, id?: string) => worker.postMessage(staticCast<MasterMessage>({
								type: 'message',
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
						type: 'subscribed',
						id: message.id,
					}));
					break;
				}

				case 'unsubscribe': {
					const channelIds = channelsIdsByName.get(message.name)!;
					channelIds.delete(message.id);
					if (channelIds.size === 0) {
						const channel = localChannelInstances.get(message.name)!;
						localChannelInstances.delete(message.name);
						disconnect(channel);
					}
					break;
				}
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

	static connect<Message>(name: string, listener: Listener<Message>) {
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
			if (message.type === 'message') {
				publish(message.name, message.publisher, message.payload);
			}
		});
	}

	static connect<Message>(name: string, listener: Listener<Message>) {
		WorkerChannel.init();
		return new Promise<WorkerChannel<Message>>(resolve => {
			const channel = new WorkerChannel<Message>(name, listener);
			const subscribeListener = (message: any) => {
				if (message.type === 'subscribed' && message.id === channel.id) {
					parentPort!.removeListener('message', subscribeListener);
					connect(channel);
					resolve(channel);
				}
			};
			parentPort!.on('message', subscribeListener);
			parentPort!.postMessage(staticCast<WorkerMessage>({
				type: 'subscribe',
				name,
				id: channel.id,
			}));
		});
	}

	static publish<Message>(name: string, message: Message) {
		parentPort!.postMessage(staticCast<WorkerMessage>({
			type: 'message',
			name,
			payload: message,
		}));
	}

	disconnect() {
		disconnect(this);
		parentPort!.postMessage(staticCast<WorkerMessage>({
			type: 'unsubscribe',
			name: this.name,
			id: this.id,
		}));
	}

	publish(message: Message) {
		parentPort!.postMessage(staticCast<WorkerMessage>({
			type: 'message',
			name: this.name,
			payload: message,
			publisher: this.id,
		}));
	}
}
