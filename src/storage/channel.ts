import { Deferred } from 'xxscreeps/utility/deferred';
import { Provider, PubSubProvider, PubSubSubscription } from './provider';

type MessageType<Message> = Message | (Message extends string ? null : { type: null });
type Listener<Message> = (message: MessageType<Message>) => void;

export class Channel<Message = string> {
	private readonly pubsub: PubSubProvider;

	constructor(storage: Provider, name: string, json?: Message extends string ? false : never);
	constructor(storage: Provider, name: string, json: true);
	constructor(
		storage: Provider,
		private readonly name: string,
		private readonly json = false,
	) {
		this.pubsub = storage.pubsub;
	}

	async listen(listener: Listener<Message>) {
		const subscription = await this.subscribe();
		subscription.listen(listener);
		return () => subscription.disconnect();
	}

	publish(message: Message) {
		const value: any = this.json ? JSON.stringify(message) : message;
		return this.pubsub.publish(this.name, value);
	}

	subscribe() {
		return Subscription.subscribe<Message>(this.pubsub, this.name, this.json);
	}
}

export class Subscription<Message> {
	private didDisconnect = false;
	private readonly disconnectListeners = new Set<() => void>();
	private readonly listeners = new Set<Listener<Message>>();

	private constructor(
		private readonly subscription: PubSubSubscription,
		private readonly json: boolean,
	) {}

	static async subscribe<Message>(pubsub: PubSubProvider, name: string, json: boolean) {
		const subscription = await pubsub.subscribe(name, message => {
			const payload = json ? JSON.parse(message) : message;
			for (const listener of instance.listeners) {
				listener(payload);
			}
		});
		const instance = new Subscription<Message>(subscription, json);
		return instance;
	}

	disconnect() {
		for (const listener of this.disconnectListeners) {
			listener();
		}
		this.didDisconnect = true;
		this.subscription.disconnect();
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

	publish(message: Message) {
		const value: any = this.json ? JSON.stringify(message) : message;
		return this.subscription.publish(value);
	}

	// Iterates over all messages in a `for await` loop
	async *[Symbol.asyncIterator](): AsyncGenerator<MessageType<Message>> {
		// Create listener to save incoming messages
		let deferred: Deferred<MessageType<Message> | void> | undefined;
		const queue: MessageType<Message>[] = [];
		const unlisten = this.listen(message => {
			if (deferred) {
				deferred.resolve(message);
				deferred = undefined;
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
				// Make promise to await on
				deferred = new Deferred;
				const { promise } = deferred;
				const disconnectListener = () => deferred!.resolve();
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
