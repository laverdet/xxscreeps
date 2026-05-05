import type { ShardTickProcessor } from './symbols.js';
import type { Shard } from 'xxscreeps/engine/db/index.js';
import { shardTickProcessors } from './symbols.js';

export interface ShardProcessorContext {
	readonly shard: Shard;
	readonly time: number;
	task: <T>(promise: Promise<T>, finalize?: (result: T) => void) => void;
}

interface Task {
	promise: Promise<any>;
	finalize: ((result: any) => void) | undefined;
}

export class ShardProcessor implements ShardProcessorContext {
	readonly shard;
	readonly time;
	private tasks: Task[] = [];

	constructor(shard: Shard, time: number) {
		this.shard = shard;
		this.time = time;
	}

	task<T>(promise: Promise<T>, finalize?: (result: T) => void) {
		this.tasks.push({ promise, finalize });
	}

	async flushTasks() {
		while (this.tasks.length) {
			const tasks = this.tasks;
			this.tasks = [];
			const results = await Promise.all(tasks.map(task => task.promise));
			for (const [ ii, task ] of tasks.entries()) {
				task.finalize?.(results[ii]);
			}
		}
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
		await fn(shard, ctx);
	}
	await ctx.flushTasks();
}
