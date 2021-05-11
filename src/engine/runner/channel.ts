import type { Shard } from 'xxscreeps/engine/shard';
import { Channel } from 'xxscreeps/engine/storage/channel';

// Messages sent to the runner for an individual user
export type RunnerIntent = { receiver: string; intent: string; params: any };
export function getRunnerUserChannel(shard: Shard, user: string) {
	type Message =
	{ type: 'eval'; expr: string } |
	{ type: 'intent'; intent: RunnerIntent };
	return new Channel<Message>(shard.pubsub, user);
}
