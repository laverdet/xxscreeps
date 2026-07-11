import type { createFlag, removeFlag } from './game.js';
import type { Shard } from 'xxscreeps/engine/db/index.js';
import { Channel } from 'xxscreeps/engine/db/channel.js';
import { read, upgrade } from './game.js';

export type FlagIntent = { type: null } | {
	type: 'create';
	params: Parameters<typeof createFlag>;
} | {
	type: 'remove';
	params: Parameters<typeof removeFlag>;
};

/**
 * Return a reference to the user's flag channel
 */
export function getFlagChannel(shard: Shard, userId: string) {
	type Message =
		{ type: 'updated'; time: number } |
		{ type: 'intent'; intent: FlagIntent };
	return new Channel<Message>(shard.pubsub, `user/${userId}/flags`);
}

/**
 * Load the unparsed flag blob for a user
 */
export async function loadUserFlagBlob(shard: Shard, userId: string) {
	const blob = await shard.data.get(`user/${userId}/flags`, { blob: true });
	// Upgrade host-side so both the backend parse and the forwarded runtime payload see the current
	// schema version.
	return blob && upgrade(blob);
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
export async function saveUserFlagBlobForNextTick(shard: Shard, userId: string, blob?: Readonly<Uint8Array>) {
	const time = shard.time + 1;
	const key = `user/${userId}/flags`;
	if (blob) {
		await shard.data.set(key, blob);
	} else {
		await shard.data.vDel(key);
	}
	await getFlagChannel(shard, userId).publish({ type: 'updated', time });
}
