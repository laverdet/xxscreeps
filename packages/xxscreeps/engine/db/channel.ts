import type { PubSubProvider, PubSubSubscription } from './storage/provider.js';
import type { Effect } from 'xxscreeps/utility/types.js';

export interface NullMessage {
	type?: never;
}

type Listener<Message> = (message: Message) => void;
export type DeferListener<Message> = (listener: Listener<Message>) => void;
export type MessageFor<Type extends Channel<unknown>> = Type extends Channel<infer Message> ? Message : never;
export type SubscriptionFor<Type extends Channel<any>> = Subscription<MessageFor<Type>>;

export class Channel<Message = string> {
	private readonly pubsub;
	private readonly name;
	private readonly json;

	constructor(pubsub: PubSubProvider, name: string, ...json: Message extends string ? [ false ] : [ true? ]);
	constructor(pubsub: PubSubProvider, name: string, json = true) {
		this.pubsub = pubsub;
		this.name = name;
		this.json = json;
	}

	async listen(listener: Listener<Message>) {
		const subscription = await this.subscribe();
		subscription.listen(listener);
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
		const value = this.json ? JSON.stringify(message) : (message as string);
		return this.pubsub.publish(this.name, value);
	}

	subscribe() {
		return Subscription.subscribe<Message>(this.pubsub, this.name, this.json);
	}
}

class Subscription<Message> {
	private didDisconnect = false;
	private readonly disconnectListeners = new Set<Effect>();
	private readonly json;
	private readonly listeners;
	private readonly subscription;
	private readonly effect;

	private constructor(json: boolean, listeners: Set<Listener<Message>>, subscription: PubSubSubscription, effect: Effect) {
		this.json = json;
		this.listeners = listeners;
		this.subscription = subscription;
		this.effect = effect;
	}

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

	// Return a function which will add a listener to the channel. When the listener is added, it will
	// be called with all messages that have been sent to the channel since this function was called.
	listenDeferred() {
		const queue: Message[] = [];
		const unlisten = this.listen(message => {
			queue.push(message);
		});
		return (listener: Listener<Message>) => {
			unlisten();
			this.listen(listener);
			for (const message of queue) {
				listener(message);
			}
		};
	}

	publish(message: Message) {
		const value: any = this.json ? JSON.stringify(message) : message;
		return this.subscription.publish(value);
	}

	// Iterates over all messages in a `for await` loop
	iterable(): AsyncIterable<Message> {
		// Create listener to save incoming messages
		type DeferredAny = DeferredMessage | DeferredReturn;
		type DeferredMessage = PromiseWithResolvers<Message | undefined>;
		type DeferredReturn = PromiseWithResolvers<void>;
		let deferred: DeferredAny | undefined;
		const queue: Message[] = [];
		const unlisten = this.listen(message => {
			if (deferred) {
				(deferred satisfies DeferredAny as DeferredMessage).resolve(message);
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
				using disposable = new DisposableStack();
				disposable.defer(unlisten);
				do {
					// Immediately yield any queued messages
					while (queue.length !== 0) {
						yield queue.shift()!;
						if (that.didDisconnect) {
							return;
						}
					}
					// Make promise to await on
					deferred = Promise.withResolvers<Message | undefined>();
					const { promise } = deferred;
					const disconnectListener = () => (deferred! satisfies DeferredAny as DeferredReturn).resolve();
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
			},
		};
	}
}
