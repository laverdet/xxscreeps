import type { PubSubListener, PubSubProvider, PubSubSubscription } from 'xxscreeps/engine/db/storage/provider.js';
import { RedisHolder } from './client.js';

export class RedisPubSubProvider implements PubSubProvider {
	private readonly publishIgnore = new Map<string, {
		client: RedisSubscription;
		message: string;
	}[]>();

	private readonly subscribersByKey = new Map<string, Set<RedisSubscription>>();
	private readonly listener;
	private readonly publisher;

	constructor(listener: RedisHolder, publisher: RedisHolder) {
		this.listener = listener;
		this.publisher = publisher;
		listener.client.on('message', (key, message) => {
			const ignoreInfo = this.publishIgnore.get(key);
			const ignore = (() => {
				if (ignoreInfo) {
					const first = ignoreInfo[0];
					if (first.message === message) {
						if (ignoreInfo.length === 1) {
							this.publishIgnore.delete(key);
						} else {
							ignoreInfo.shift();
						}
						return first.client;
					}
				}
			})();
			const subscribers = this.subscribersByKey.get(key);
			if (subscribers) {
				for (const subscriber of subscribers) {
					if (subscriber !== ignore) {
						subscriber.listener(message);
					}
				}
			}
		});
	}

	static async connect(url: URL, blob = false) {
		const [ effect1, client1 ] = await RedisHolder.connect(url, blob);
		const [ effect2, client2 ] = await RedisHolder.connect(url, blob);
		const provider = new RedisPubSubProvider(client1, client2);
		return [ () => { effect1(); effect2(); }, provider ] as const;
	}

	async publish(key: string, message: string) {
		await this.publisher.invoke(cb => this.publisher.batch().publish(key, message, cb));
	}

	async publishFromClient(key: string, message: string, client: RedisSubscription) {
		const ignore = this.publishIgnore.get(key);
		if (ignore) {
			ignore.push({ client, message });
		} else {
			this.publishIgnore.set(key, [ { client, message } ]);
		}
		await this.publisher.invoke(cb => this.publisher.batch().publish(key, message, cb));
	}

	async subscribe(key: string, listener: PubSubListener) {
		let subscribers = this.subscribersByKey.get(key);
		if (!subscribers) {
			subscribers = new Set();
			this.subscribersByKey.set(key, subscribers);
			await this.listener.invoke(cb => this.listener.batch().subscribe(key, cb));
		}
		const subscriber = new RedisSubscription(listener, key, this);
		subscribers.add(subscriber);
		return [ () => this.unsubscribe(key, subscriber), subscriber ] as const;
	}

	unsubscribe(key: string, subscriber: RedisSubscription) {
		const subscribers = this.subscribersByKey.get(key)!;
		if (subscribers.size === 1) {
			this.subscribersByKey.delete(key);
		} else {
			subscribers.delete(subscriber);
		}
	}
}

class RedisSubscription implements PubSubSubscription {
	readonly listener;
	private readonly key;
	private readonly parent;

	constructor(listener: (message: string) => void, key: string, parent: RedisPubSubProvider) {
		this.listener = listener;
		this.key = key;
		this.parent = parent;
	}

	publish(message: string) {
		return this.parent.publishFromClient(this.key, message, this);
	}
}
