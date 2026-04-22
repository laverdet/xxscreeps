import type { Shard } from 'xxscreeps/engine/db/index.js';
import { Channel } from 'xxscreeps/engine/db/channel.js';

// Cross-process cache invalidation. Out-of-band writers that mutate room or
// terrain blobs publish here so processor/runner drop cached copies before the
// next tick. Intent-pipeline writers don't need this — the processor mutates
// the cached Room in place. `accessibleRooms` is the lighter signal: the
// active-rooms set changed but no blobs did, so runner/processor skip the
// world reload and only consumers that care (backend) refresh.
export type InvalidationMessage =
	{ type: 'room'; roomName: string } |
	{ type: 'world' } |
	{ type: 'accessibleRooms' };

export function getInvalidationChannel(shard: Shard) {
	return new Channel<InvalidationMessage>(shard.pubsub, 'channel/invalidation');
}
