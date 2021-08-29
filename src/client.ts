import type { URL } from 'url';
import type { Multi } from 'redis';
import redis from 'redis';
import { listen } from 'xxscreeps/utility/async';
export type Redis = redis.RedisClient;

declare module 'redis' {
	interface Multi {
		copy: OverloadedCommand<string, number, Multi>;
		smismember: OverloadedCommand<string, number[], Multi>;
		zdiffstore: OverloadedCommand<string | number, number, boolean>;
		zmscore: OverloadedCommand<string, number[], Multi>;
		zrangestore: OverloadedCommand<string, number, boolean>;
	}
	interface RedisClient {
		copy: OverloadedCommand<string, number, boolean>;
		smismember: OverloadedCommand<string, number[], boolean>;
		zdiffstore: OverloadedCommand<string | number, number, boolean>;
		zmscore: OverloadedCommand<string, number[], boolean>;
		zrangeStore: OverloadedCommand<string, number, boolean>;
	}
}

export class RedisHolder {
	private task = Promise.resolve();
	private tickBatch?: Multi;
	private tickBatchId = 0;
	private tickBatchFresh = false;

	private constructor(public readonly client: Redis) {}

	static async connect(url: URL, blob = false) {
		const client = redis.createClient(`${url}`, {
			enable_offline_queue: false,
			return_buffers: Boolean(blob),
			retry_strategy: () => false,
		});
		await new Promise<void>((resolve, reject) => {
			const unlisten1 = listen(client, 'ready', () => { unlisten(); resolve() });
			const unlisten2 = listen(client, 'error', error => { unlisten(); reject(error) });
			const unlisten = (): void => { unlisten1(); unlisten2() };
		});
		client.on('error', error => {
			console.error(error.message);
			process.exit();
		});
		return [ () => client.quit(), new RedisHolder(client) ] as const;
	}

	batch(): Multi {
		const client = this.tickBatch ??= this.client.batch();
		if (!this.tickBatchFresh) {
			this.tickBatchFresh = true;
			const id = ++this.tickBatchId;
			process.nextTick(() => {
				this.tickBatchFresh = false;
				if (id === this.tickBatchId) {
					this.tickBatch = undefined;
					this.task = this.invoke<any>(fn => client.exec(fn));
				}
			});
		}
		return client;
	}

	sync() {
		const client = this.tickBatch;
		if (client) {
			++this.tickBatchId;
			this.tickBatchFresh = false;
			this.tickBatch = undefined;
			this.task = this.invoke<any>(fn => client.exec(fn));
		}
		return this.task;
	}

	invoke<Type>(fn: (cb: (err: Error | null, result: Type) => any) => void) {
		return new Promise<Type>((resolve, reject) => {
			fn((err, result) => {
				if (err) {
					reject(err);
				} else {
					resolve(result);
				}
			});
		});
	}
}
