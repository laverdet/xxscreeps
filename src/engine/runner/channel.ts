import type { Shard } from 'xxscreeps/engine/model/shard';
import { Channel } from 'xxscreeps/storage/channel';

// Messages sent to the runner for an individual user
type RunnerCodePushMessage = { type: 'code'; id: string; name: string };
type RunnerEvalMessage = { type: 'eval'; expr: string };
export type RunnerIntent = { receiver: string; intent: string; params: any };
type RunnerIntentMessage = { type: 'intent'; intent: RunnerIntent };
export type RunnerUserMessage = RunnerCodePushMessage | RunnerEvalMessage | RunnerIntentMessage;

export function getRunnerUserChannel(shard: Shard, user: string) {
	return new Channel<RunnerUserMessage>(shard.pubsub, user);
}
