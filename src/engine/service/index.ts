import type { Shard } from 'xxscreeps/engine/shard';
import { Channel } from 'xxscreeps/engine/storage/channel';

export function getServiceChannel(shard: Shard) {
	type Message =
		{ type: 'shutdown' } |
		{ type: 'mainConnected' } |
		{ type: 'mainDisconnected' } |
		{ type: 'processorInitialized' } |
		{ type: 'runnerConnected' } |
		{ type: 'tickFinished' };
	return new Channel<Message>(shard.pubsub, 'channel/service');
}
