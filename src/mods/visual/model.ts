import type { TickResult } from 'xxscreeps/engine/runner';
import type { Shard } from 'xxscreeps/engine/db';
import * as Visual from 'xxscreeps/mods/visual/visual';
import { makeReader } from 'xxscreeps/schema';
import { Channel } from 'xxscreeps/engine/db/channel';

export function getVisualChannel(shard: Shard, userId: string) {
	type Message = { type: 'publish'; roomNames: string[]; time: number };
	return new Channel<Message>(shard.pubsub, `user/${userId}/visual`);
}

const visualsReader = makeReader(Visual.schema);
export async function loadVisuals(shard: Shard, userId: string) {
	const fragment = `user/${userId}/visual${shard.time % 2}`;
	const blob = await shard.blob.getBuffer(fragment);
	if (blob) {
		try {
			return visualsReader(blob);
		} catch (err) {}
	}
}

export async function publishVisualsBlobForNextTick(shard: Shard, userId: string, payload: TickResult['visuals']) {
	const time = shard.time + 1;
	const fragment = `user/${userId}/visual${time % 2}`;
	if (payload) {
		await Promise.all([
			shard.blob.set(fragment, payload.blob),
			getVisualChannel(shard, userId).publish({ type: 'publish', roomNames: payload.roomNames, time }),
		]);
	} else {
		await shard.blob.del(fragment);
	}
}
