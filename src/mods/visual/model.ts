import type { Shard } from 'xxscreeps/engine/model/shard';
import * as Visual from 'xxscreeps/mods/visual/visual';
import { makeReader } from 'xxscreeps/schema';
import { Channel } from 'xxscreeps/engine/storage/channel';

export function getVisualChannel(shard: Shard, userId: string) {
	type Message = { type: 'publish'; roomNames: string[]; time: number };
	return new Channel<Message>(shard.pubsub, `user/${userId}/visual`);
}

const visualsReader = makeReader(Visual.schema);
export async function loadVisuals(shard: Shard, userId: string) {
	const fragment = `user/${userId}/visual${shard.time % 2}`;
	try {
		return visualsReader(await shard.blob.reqBuffer(fragment));
	} catch (err) {}
}

export async function publishVisualsBlobForNextTick(shard: Shard, userId: string, roomNames: string[], visual: Readonly<Uint8Array> | undefined) {
	const time = shard.time + 1;
	const fragment = `user/${userId}/visual${time % 2}`;
	if (visual) {
		await Promise.all([
			shard.blob.set(fragment, visual),
			getVisualChannel(shard, userId).publish({ type: 'publish', roomNames, time }),
		]);
	} else {
		try {
			await shard.blob.del(fragment);
		} catch (err) {}
	}
}
