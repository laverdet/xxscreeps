import type { Shard } from 'xxscreeps/engine/model/shard';
import { Channel } from 'xxscreeps/storage/channel';

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
