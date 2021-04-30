import type { Shard } from 'xxscreeps/engine/model/shard';
import { Channel } from 'xxscreeps/storage/channel';
import { read } from './game';

/**
 * Return a reference to the user's flag channel
 */
export function getFlagChannel(shard: Shard, userId: string) {
	type Message =
		{ type: 'updated' } |
		{ type: 'intent'; intent: any };
	return new Channel<Message>(shard.pubsub, `user/${userId}/flags`);
}

/**
 * Load the unparsed flag blob for a user
 */
export function loadUserFlagBlob(shard: Shard, userId: string) {
	return shard.blob.getBuffer(`user/${userId}/flags`);
}

/**
 * Load a user's flags and return the game objects
 */
export async function loadUserFlags(shard: Shard, userId: string) {
	const flagBlob = await loadUserFlagBlob(shard, userId);
	if (flagBlob) {
		return read(flagBlob);
	} else {
		return Object.create(null) as never;
	}
}

/**
 * Save a user's processed flag blob
 */
export async function saveUserFlagBlobForNextTick(shard: Shard, userId: string, blob: Readonly<Uint8Array>) {
	await shard.blob.set(`user/${userId}/flags`, blob);
	await getFlagChannel(shard, userId).publish({ type: 'updated' });
}
