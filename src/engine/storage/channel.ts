import type { Effect } from 'xxscreeps/utility/types';
import type { PubSubProvider, PubSubSubscription } from './provider';
import { Deferred } from 'xxscreeps/utility/async';

type MessageType<Message> = Message | (Message extends string ? null : { type: null });
type Listener<Message> = (message: MessageType<Message>) => void;
export type SubscriptionFor<Factory extends (...args: any[]) => Channel<any>> =
	ReturnType<Factory> extends Channel<infer Message> ? Subscription<Message> : never;

export class Channel<Message = string> {
	constructor(pubsub: PubSubProvider, name: string, ...json: Message extends string ? [ false ] : [ true? ]);
	constructor(
		private readonly pubsub: PubSubProvider,
		private readonly name: string,
		private readonly json = true,
	) {}

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
	private readonly disconnectListeners = new Set<Effect>();
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
