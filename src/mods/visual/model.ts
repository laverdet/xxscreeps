import type { Shard } from 'xxscreeps/engine/db';
import * as Visual from 'xxscreeps/mods/visual/visual';
import { Variant, makeReader } from 'xxscreeps/schema';
import { Channel } from 'xxscreeps/engine/db/channel';
import { stringifyInherited, typedArrayToString } from 'xxscreeps/utility/string';

export function getVisualChannel(shard: Shard, userId: string) {
	type Message = { type: 'publish'; roomNames: string[]; time: number };
	return new Channel<Message>(shard.pubsub, `user/${userId}/visual`);
}

const visualsReader = makeReader(Visual.schema);
export async function loadVisuals(shard: Shard, userId: string, roomName: string) {
	const fragment = `user/${userId}/visual${shard.time % 2}`;
	const payload = await shard.scratch.hmget(fragment, [ 'time', '*', roomName ], { blob: true });
	function stringify(blob: Readonly<Uint8Array> | null) {
		let visualsString = '';
		if (blob) {
			for (const visual of visualsReader(blob)) {
				(visual as any).t = visual[Variant];
				visualsString += stringifyInherited(visual) + '\n';
			}
		}
		return visualsString;
	}
	if (payload.time && typedArrayToString(payload.time) === `${shard.time}`) {
		return stringify(payload['*']) + stringify(payload[roomName]);
	} else {
		return '';
	}
}

export async function publishVisualsBlobsForNextTick(shard: Shard, userId: string, payload: Map<string, Readonly<Uint8Array>>) {
	const time = shard.time + 1;
	const fragment = `user/${userId}/visual${time % 2}`;
	if (payload.size === 0) {
		await shard.scratch.del(fragment);
	} else {
		await Promise.all([
			shard.scratch.del(fragment),
			shard.scratch.hmset(fragment, [
				[ 'time', Buffer.from(`${time}`) ],
				...payload,
			]),
			getVisualChannel(shard, userId).publish({ type: 'publish', roomNames: [ ...payload.keys() ], time }),
		]);
	}
}
