import type { Shard } from 'xxscreeps/engine/db/index.js';
import { isMainThread, workerData } from 'node:worker_threads';
import { Channel } from 'xxscreeps/engine/db/channel.js';

// "Top thread" is either the main nodejs process, or the worker thread spawned by 'entry.ts'
// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
export const isTopThread: boolean = isMainThread || Boolean(workerData?.isTopThread);

export function getServiceChannel(shard: Shard) {
	type Message =
		{ type: 'shutdown' } |
		{ type: 'mainConnected' } |
		{ type: 'mainDisconnected' } |
		{ type: 'processorInitialized' } |
		{ type: 'runnerConnected' } |
		{ type: 'tickFinished'; time: number };
	return new Channel<Message>(shard.pubsub, 'channel/service');
}

let isEntry = isTopThread;
export function checkIsEntry() {
	const result = isEntry;
	isEntry = false;
	return result;
}
