import type { Effect } from 'xxscreeps/utility/types';
import type { Shard } from 'xxscreeps/engine/db';
import { Channel } from 'xxscreeps/engine/db/channel';
import { tickSpeed } from 'xxscreeps/engine/service/tick';

export function getConsoleChannel(shard: Shard, user: string) {
	type Message = {
		type: 'ack';
		id: string;
		result: { error: boolean; value: string };
	} |
	{ type: 'log'; value: string } |
	{ type: 'error'; value: string } |
	{ type: 'result'; value: string };

	return new Channel<Message>(shard.pubsub, `user/${user}/console`);
}

export function getRunnerChannel(shard: Shard) {
	type RunnerMessage =
		{ type: 'shutdown' } |
		{ type: 'run'; time: number };
	return new Channel<RunnerMessage>(shard.pubsub, 'channel/runner');
}

// Messages sent to the runner for an individual user
export type RunnerIntent = { receiver: string; intent: string; params: any[] };
export function getRunnerUserChannel(shard: Shard, user: string) {
	type Message =
		{ type: 'eval'; payload: { ack?: string; echo: boolean; expr: string } } |
		{ type: 'intent'; intent: RunnerIntent };
	return new Channel<Message>(shard.pubsub, `runner/${user}`);
}

export function getUsageChannel(shard: Shard, user: string) {
	return new Channel<any>(shard.pubsub, `runner/${user}/usage`);
}

export function requestRunnerEval(shard: Shard, userId: string, expr: string, echo: boolean) {
	void getRunnerUserChannel(shard, userId).publish({ type: 'eval', payload: { echo, expr } });
}

/**
 * Sends an eval expression to the user's runner instance and waits for a reply.
 */
export async function requestRunnerEvalAck(shard: Shard, userId: string, expr: string, echo: boolean) {
	let timeout: any;
	let subscription: Promise<Effect>;
	const id = `${Math.random()}`;
	const result = new Promise<any>((resolve, reject) => {
		subscription = getConsoleChannel(shard, userId).listen(message => {
			if (message.type === 'ack' && message.id === id) {
				if (message.result.error) {
					reject(new Error(message.result.value));
				} else {
					resolve(message.result.value);
				}
			}
		});
		timeout = setTimeout(
			() => reject(new Error('Timed out')),
			Math.max(500, tickSpeed * 4));
	});
	await getRunnerUserChannel(shard, userId).publish({ type: 'eval', payload: { ack: id, echo, expr } });
	try {
		return await result;
	} finally {
		clearTimeout(timeout);
		(await subscription!)();
	}

}

export const runnerUsersSetKey = (time: number) =>
	`tick${time % 2}/runnerUsers`;
