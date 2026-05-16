import type { PubSubListener, PubSubProvider, PubSubSubscription } from 'xxscreeps/engine/db/storage/provider.js';
import { RedisHolder } from './client.js';

interface PublishIgnore {
	client: RedisSubscription;
	message: string;
}

export class RedisPubSubProvider implements PubSubProvider {
	private readonly prefix;
	private readonly publishIgnore = new Map<string, [ PublishIgnore, ...PublishIgnore[] ]>();

	private readonly subscribersByKey = new Map<string, Set<RedisSubscription>>();
	private readonly listener;
	private readonly publisher;

	constructor(prefix: string, listener: RedisHolder, publisher: RedisHolder) {
		this.prefix = prefix;
		this.listener = listener;
		this.publisher = publisher;
		listener.client.on('message', (prefixKey, message) => {
			const ignore = (() => {
				const ignoreInfo = this.publishIgnore.get(prefixKey);
				if (ignoreInfo) {
					const first = ignoreInfo[0];
					if (first.message === message) {
						if (ignoreInfo.length === 1) {
							this.publishIgnore.delete(prefixKey);
						} else {
							ignoreInfo.shift();
						}
						return first.client;
					}
				}
			})();
			const subscribers = this.subscribersByKey.get(prefixKey);
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
		const prefix = `${Number(url.pathname.slice(1)) || 0}/`;
		const [ effect1, client1 ] = await RedisHolder.connect(url, blob);
		const [ effect2, client2 ] = await RedisHolder.connect(url, blob);
		const provider = new RedisPubSubProvider(prefix, client1, client2);
		return [ () => { effect1(); effect2(); }, provider ] as const;
	}

	async publish(key: string, message: string) {
		const prefixKey = `${this.prefix}${key}`;
		await this.publisher.invoke(cb => this.publisher.batch().publish(prefixKey, message, cb));
	}

	async publishFromClient(key: string, message: string, client: RedisSubscription) {
		const prefixKey = `${this.prefix}${key}`;
		const ignore = this.publishIgnore.get(prefixKey);
		if (ignore) {
			ignore.push({ client, message });
		} else {
			this.publishIgnore.set(prefixKey, [ { client, message } ]);
		}
		await this.publisher.invoke(cb => this.publisher.batch().publish(prefixKey, message, cb));
	}

	async subscribe(key: string, listener: PubSubListener) {
		const prefixKey = `${this.prefix}${key}`;
		let subscribers = this.subscribersByKey.get(prefixKey);
		if (!subscribers) {
			subscribers = new Set();
			this.subscribersByKey.set(prefixKey, subscribers);
			await this.listener.invoke(cb => this.listener.batch().subscribe(prefixKey, cb));
		}
		const subscriber = new RedisSubscription(listener, key, this);
		subscribers.add(subscriber);
		return [ () => this.unsubscribe(key, subscriber), subscriber ] as const;
	}

	unsubscribe(key: string, subscriber: RedisSubscription) {
		const prefixKey = `${this.prefix}${key}`;
		const subscribers = this.subscribersByKey.get(prefixKey)!;
		if (subscribers.size === 1) {
			this.subscribersByKey.delete(prefixKey);
			this.publishIgnore.delete(prefixKey);
			this.listener.invoke(cb => this.listener.batch().unsubscribe(prefixKey, cb)).catch(() => {});
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
