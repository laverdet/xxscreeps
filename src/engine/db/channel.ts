import type { Effect } from 'xxscreeps/utility/types.js';
import type { PubSubProvider, PubSubSubscription } from './storage/provider.js';
import { Deferred } from 'xxscreeps/utility/async.js';

type MessageType<Message> = Message;
type Listener<Message> = (message: MessageType<Message>) => void;
type ChannelFactory<Message = any> = (...args: any[]) => Channel<Message>;
export type MessageFor<Factory> = Factory extends ChannelFactory<infer Message> ? Message : never;
export type SubscriptionFor<Factory> = Factory extends ChannelFactory<infer Message> ? Subscription<Message> : never;

export class Channel<Message = string> {
	constructor(pubsub: PubSubProvider, name: string, ...json: Message extends string ? [ false ] : [ true? ]);
	constructor(
		private readonly pubsub: PubSubProvider,
		private readonly name: string,
		private readonly json = true,
	) {}

	async listen<ForIf = false>(listener: Listener<Message | (ForIf extends true ? { type: null } : never)>) {
		const subscription = await this.subscribe();
		subscription.listen(listener as any);
		return () => subscription.disconnect();
	}

	listenFor(filter: (message: Message) => boolean): [ Effect, Promise<Message | undefined> ] {
		let resolver: (message?: Message) => void;
		const subscription = this.listen(message => {
			if (filter(message)) {
				resolver(message);
			}
		});
		return [
			() => resolver(),
			new Promise<Message | undefined>((resolve, reject) => {
				subscription.catch(reject);
				resolver = message => {
					resolver = () => {};
					resolve(message);
					void subscription.then(effect => effect());
				};
			}),
		];
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

	private constructor(
		private readonly json: boolean,
		private readonly listeners: Set<Listener<Message>>,
		private readonly subscription: PubSubSubscription,
		private readonly effect: Effect,
	) {}

	static async subscribe<Message>(pubsub: PubSubProvider, name: string, json: boolean) {
		const listeners = new Set<Listener<Message>>();
		const [ effect, subscription ] = await pubsub.subscribe(name, message => {
			const payload = json ? JSON.parse(message) : message;
			for (const listener of listeners) {
				listener(payload);
			}
		});
		return new Subscription<Message>(json, listeners, subscription, effect);
	}

	disconnect() {
		for (const listener of this.disconnectListeners) {
			listener();
		}
		this.effect();
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

	publish(message: Message) {
		const value: any = this.json ? JSON.stringify(message) : message;
		return this.subscription.publish(value);
	}

	// Iterates over all messages in a `for await` loop
	iterable(): AsyncIterable<MessageType<Message>> {
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
		// The top function is not async in order to ensure it is run immediately. When it's time to
		// wait on the channel we switch to an async closure.
		// eslint-disable-next-line @typescript-eslint/no-this-alias
		const that = this;
		return {
			async *[Symbol.asyncIterator]() {
				try {
					do {
						// Immediately yield any queued messages
						while (queue.length !== 0) {
							yield queue.shift()!;
							if (that.didDisconnect) {
								return;
							}
						}
						// Make promise to await on
						deferred = new Deferred;
						const { promise } = deferred;
						const disconnectListener = () => deferred!.resolve();
						that.disconnectListeners.add(disconnectListener);
						// Wait for new messages
						const value = await promise;
						that.disconnectListeners.delete(disconnectListener);
						// Check for `undefined` from disconnect listener
						if (value === undefined) {
							return;
						}
						// Yield back to loop
						yield value;
						if (that.didDisconnect) {
							return;
						}
					} while (true);
				} finally {
					// Clean up listeners when it's all done
					unlisten();
				}
			},
		};
	}
}
