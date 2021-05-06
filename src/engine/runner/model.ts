import type { Shard } from 'xxscreeps/engine/shard';
import { Channel } from 'xxscreeps/engine/storage/channel';

type ConsoleMessage =
	{ type: 'log'; value: string } |
	{ type: 'error'; value: string } |
	{ type: 'result'; value: string };

export function getConsoleChannel(shard: Shard, user: string) {
	return new Channel<ConsoleMessage>(shard.pubsub, `user/${user}/console`);
}

export function getRunnerChannel(shard: Shard) {
	type RunnerMessage =
		{ type: 'shutdown' } |
		{ type: 'run'; time: number };
	return new Channel<RunnerMessage>(shard.pubsub, 'channel/runner');
}

export const runnerUsersSetKey = (time: number) =>
	`tick${time % 2}/runnerUsers`;
