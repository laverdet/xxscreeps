import type { Shard } from 'xxscreeps/engine/db';
import { Channel } from 'xxscreeps/engine/db/channel';

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
