import type { Multi } from 'redis';
import * as Fn from 'xxscreeps/utility/functional';
import redis from 'redis';
import { Deferred, listen, mustNotReject } from 'xxscreeps/utility/async';
import { getOrSet } from 'xxscreeps/utility/utility';
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

type Merge = {
	argv: any[];
	command: string;
	deferred: Deferred[];
	keys: Set<string>;
	fn: (argv: any[]) => Promise<void>;
};
export class RedisHolder {
	private readonly mergeByCommand = new Map<string, Merge>();
	private readonly mergeByKey = new Map<string, Merge>();
	private task = Promise.resolve();
	private tickBatch: Multi | undefined;
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

	batch(...keys: string[]): Multi {
		const client = this.tickBatch ??= this.client.batch();
		mustNotReject(Fn.mapAsync(new Set(
			Fn.filter(Fn.map(keys, key => this.mergeByKey.get(key)))), merge => this.flush(merge)));
		if (!this.tickBatchFresh) {
			this.tickBatchFresh = true;
			const id = ++this.tickBatchId;
			process.nextTick(() => {
				if (id === this.tickBatchId) {
					// Set flag so that a new batch client isn't created by merge handlers
					this.tickBatchFresh = true;
					mustNotReject(Fn.mapAsync(this.mergeByCommand.values(), merge => this.flush(merge)));
					this.tickBatch = undefined;
					this.task = this.invoke<any>(fn => client.exec(fn));
				}
				this.tickBatchFresh = false;
			});
		}
		return client;
	}

	async merge<Arg>(command: string, keys: string[], arg: Arg, fn: (argv: Arg[]) => Promise<void>) {
		this.batch();
		const merge = getOrSet(this.mergeByCommand, command, () => ({
			argv: [],
			command,
			deferred: [],
			keys: new Set<string>(),
			fn,
		}));
		const existing = Fn.filter(Fn.map(keys, key => {
			const existing = this.mergeByKey.get(key);
			return existing === merge ? undefined : existing;
		}));
		mustNotReject(Fn.mapAsync(existing, merge => this.flush(merge)));
		for (const key of keys) {
			this.mergeByKey.set(key, merge);
		}
		const deferred = new Deferred;
		merge.argv.push(arg);
		merge.deferred.push(deferred);
		keys.forEach(key => merge.keys.add(key));
		await deferred.promise;
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

	private async flush(merge: Merge) {
		this.mergeByCommand.delete(merge.command);
		for (const key of merge.keys) {
			this.mergeByKey.delete(key);
		}
		try {
			await merge.fn(merge.argv);
			merge.deferred.forEach(deferred => deferred.resolve());
		} catch (err: any) {
			merge.deferred.forEach(deferred => deferred.reject(err));
		}
	}
}
