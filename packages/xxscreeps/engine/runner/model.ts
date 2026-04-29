import type { Shard } from 'xxscreeps/engine/db/index.js';
import { Channel } from 'xxscreeps/engine/db/channel.js';
import { tickSpeed } from 'xxscreeps/engine/service/tick.js';
import { acquireTimeout } from 'xxscreeps/utility/utility.js';

export function getConsoleChannel(shard: Shard, user: string) {
	return new Channel(shard.pubsub, `user/${user}/console`, false);
}

export function getAckChannel(shard: Shard, user: string) {
	type Message = {
		id: string;
		result: { error: boolean; value: string };
	};
	return new Channel<Message>(shard.pubsub, `user/${user}/ack`);
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

/**
 * Sends an eval expression to the user's runner instance and waits for a reply.
 */
export async function requestRunnerEval(shard: Shard, userId: string, expr: string, echo: boolean) {
	using disposable = new DisposableStack();
	// Response timeout
	const timer = Promise.withResolvers<never>();
	using _timeout = acquireTimeout(
		Math.max(500, tickSpeed * 4),
		() => timer.reject(new Error('Runner did not respond')),
	);

	// Response promise
	const id = `${Math.random()}`;
	const [ effect, promise ] = getAckChannel(shard, userId).listenFor(message => message.id === id);
	disposable.defer(effect);

	// Send the request
	await getRunnerUserChannel(shard, userId).publish({ type: 'eval', payload: { ack: id, echo, expr } });
	const { result } = (await Promise.race([ timer.promise, promise ]))!;
	if (result.error) {
		throw new Error(result.value);
	} else {
		return result.value;
	}
}

export const runnerUsersSetKey = (time: number) =>
	`tick${time % 2}/runnerUsers`;
