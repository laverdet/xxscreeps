import type { URL } from 'url';
import type { PubSubListener, PubSubProvider, PubSubSubscription } from 'xxscreeps/engine/db/storage/provider';
import type { Redis } from './redis';
import { makeClient } from './redis';

export class RedisPubSubProvider implements PubSubProvider {
	private readonly publishIgnore = new Map<string, {
		client: RedisSubscription;
		message: string;
	}[]>();

	private readonly subscribersByKey = new Map<string, Set<RedisSubscription>>();

	constructor(
		private readonly listener: Redis,
		private readonly publisher: Redis,
	) {
		listener.on('message', (key, message) => {
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

	static async connect(url: URL) {
		return new RedisPubSubProvider(
			await makeClient(url),
			await makeClient(url),
		);
	}

	disconnect() {
		this.listener.disconnect();
		this.publisher.disconnect();
	}

	async publish(key: string, message: string) {
		await this.publisher.publish(key, message);
	}

	async publishFromClient(key: string, message: string, client: RedisSubscription) {
		const ignore = this.publishIgnore.get(key);
		if (ignore) {
			ignore.push({ client, message });
		} else {
			this.publishIgnore.set(key, [ { client, message } ]);
		}
		await this.publisher.publish(key, message);
	}

	async subscribe(key: string, listener: PubSubListener) {
		let subscribers = this.subscribersByKey.get(key);
		if (!subscribers) {
			subscribers = new Set;
			this.subscribersByKey.set(key, subscribers);
			await this.listener.subscribe(key);
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
	constructor(
		public readonly listener: (message: string) => void,
		private readonly key: string,
		private readonly parent: RedisPubSubProvider,
	) {}

	publish(message: string) {
		return this.parent.publishFromClient(this.key, message, this);
	}
}
