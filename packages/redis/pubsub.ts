import type { RedisClient } from './client.js';
import type { PubSubListener, PubSubProvider, PubSubSubscription } from 'xxscreeps/engine/db/storage/provider.js';
import { mustNotReject } from 'xxscreeps/utility/async.js';
import { acquireRedisClient } from './client.js';

interface PublishIgnore {
	client: RedisSubscription;
	message: string;
}

interface SubscriptionDelegate {
	ignore: PublishIgnore[];
	subscribers: Set<RedisSubscription>;
}

export class RedisPubSubProvider implements PubSubProvider {
	private readonly disposable;
	private readonly prefix;
	private readonly client;
	private readonly subscribersByKey = new Map<string, SubscriptionDelegate>();

	constructor(disposable: DisposableStack, prefix: string, client: RedisClient) {
		this.disposable = disposable;
		this.prefix = prefix;
		this.client = client;
	}

	static async connect(url: URL) {
		const prefix = `${Number(url.pathname.slice(1)) || 0}/`;
		using disposable = new DisposableStack();
		const client = disposable.adopt(await acquireRedisClient(url), client => mustNotReject(client.close()));
		return new RedisPubSubProvider(disposable.move(), prefix, client);
	}

	// eslint-disable-next-line @typescript-eslint/require-await
	async [Symbol.asyncDispose]() {
		this.disposable.dispose();
	}

	async publish(key: string, message: string) {
		const prefixKey = `${this.prefix}${key}`;
		await this.client.sPublish(prefixKey, message);
	}

	async publishFromClient(key: string, message: string, client: RedisSubscription) {
		const prefixKey = `${this.prefix}${key}`;
		const subscribersInfo = this.subscribersByKey.get(prefixKey);
		if (subscribersInfo) {
			subscribersInfo.ignore.push({ client, message });
		}
		await this.client.sPublish(prefixKey, message);
	}

	async subscribe(key: string, listener: PubSubListener) {
		const prefixKey = `${this.prefix}${key}`;
		const subscribers = await (async () => {
			const subscribersInfo = this.subscribersByKey.get(prefixKey);
			if (subscribersInfo) {
				return subscribersInfo.subscribers;
			} else {
				const ignore: PublishIgnore[] = [];
				const subscribers = new Set<RedisSubscription>();
				this.subscribersByKey.set(prefixKey, { ignore, subscribers });
				await this.client.sSubscribe(prefixKey, message => {
					const ignoreClient = (() => {
						const first = ignore[0];
						if (first?.message === message) {
							ignore.shift();
							return first.client;
						}
					})();
					for (const subscriber of subscribers) {
						if (subscriber !== ignoreClient) {
							subscriber.listener(message);
						}
					}
				});
				return subscribers;
			}
		})();
		const subscriber = new RedisSubscription(listener, key, this);
		subscribers.add(subscriber);
		return [ () => this.unsubscribe(key, subscriber), subscriber ] as const;
	}

	async unsubscribe(key: string, subscriber: RedisSubscription) {
		const prefixKey = `${this.prefix}${key}`;
		const subscribersInfo = this.subscribersByKey.get(prefixKey);
		// The delegate entry may already be gone (another subscriber to the same key tore it down, or a
		// subscribe raced with this unsubscribe), and `subscriber` may no longer be a member. Removing an
		// unknown subscriber is a no-op — this keeps unsubscribe idempotent instead of crashing.
		if (!subscribersInfo?.subscribers.delete(subscriber)) {
			return;
		}
		// Only drop the shared Redis subscription once the last local subscriber for this key is gone.
		if (subscribersInfo.subscribers.size === 0) {
			this.subscribersByKey.delete(prefixKey);
			await this.client.sUnsubscribe(prefixKey);
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
