import type { Shard } from './shard';
import { Channel } from 'xxscreeps/engine/storage/channel';

type ConsoleMessage =
	{ type: 'log'; value: string } |
	{ type: 'error'; value: string } |
	{ type: 'result'; value: string };

export function getConsoleChannel(shard: Shard, user: string) {
	return new Channel<ConsoleMessage>(shard.pubsub, `user/${user}/console`);
}
