import type { ShardTickProcessor } from './symbols.js';
import type { Shard } from 'xxscreeps/engine/db/index.js';
import { Fn } from 'xxscreeps/functional/fn.js';
import { activeRoomsKey, sleepingRoomsKey } from './model.js';
import { shardTickProcessors } from './symbols.js';

export interface ShardProcessorContext {
	readonly shard: Shard;
	readonly time: number;
	activateRoom: (roomName: string) => void;
	wakeAt: (time: number, roomName: string) => void;
	task: <T>(promise: Promise<T>, finalize?: (result: T) => void) => void;
}

export class ShardProcessor implements ShardProcessorContext {
	readonly shard;
	readonly time;
	private readonly activations = new Set<string>();
	private readonly wakeUps: [ number, string ][] = [];
	private tasks: { promise: Promise<any>; finalize: ((result: any) => void) | undefined }[] = [];

	constructor(shard: Shard, time: number) {
		this.shard = shard;
		this.time = time;
	}

	activateRoom(roomName: string) {
		this.activations.add(roomName);
	}

	wakeAt(time: number, roomName: string) {
		if (time <= this.time) {
			throw new Error(`Invalid wake time ${time}; current ${this.time}`);
		}
		this.wakeUps.push([ time, roomName ]);
	}

	task<T>(promise: Promise<T>, finalize?: (result: T) => void) {
		this.tasks.push({ promise, finalize });
	}

	async flushTasks() {
		while (this.tasks.length) {
			const tasks = this.tasks;
			this.tasks = [];
			const results = await Promise.allSettled(Fn.map(tasks, task => task.promise));
			for (const [ ii, task ] of tasks.entries()) {
				const result = results[ii];
				if (result.status === 'fulfilled') {
					try {
						task.finalize?.(result.value);
					} catch (err) {
						console.error(`shard tick processor task finalize threw on tick ${this.time}:`, err);
					}
				} else {
					console.error('shard tick processor task threw:', result.reason);
				}
			}
		}
	}

	async commit() {
		await Promise.all([
			this.shard.scratch.zadd(activeRoomsKey,
				[ ...Fn.map(this.activations, name => [ 0, name ] as [ number, string ]) ]),
			this.shard.scratch.zadd(sleepingRoomsKey, this.wakeUps, { if: 'nx' }),
		]);
	}
}

export function registerShardTickProcessor(tick: ShardTickProcessor) {
	shardTickProcessors.push(tick);
}

export const everyNTicks = (period: number, fn: ShardTickProcessor): ShardTickProcessor =>
	(shard, ctx) => {
		if (ctx.time % period === 0) {
			return fn(shard, ctx);
		}
	};

export async function runShardTickProcessors(shard: Shard, time: number) {
	const ctx = new ShardProcessor(shard, time);
	for (const fn of shardTickProcessors) {
		try {
			await fn(shard, ctx);
		} catch (err) {
			console.error(`shard tick processor threw on tick ${time}:`, err);
		}
	}
	await ctx.flushTasks();
	await ctx.commit();
}
