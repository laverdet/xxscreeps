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
	const fields = [ 'time', roomName ];
	if (roomName !== 'map') fields.push('*');
	const payload = await shard.scratch.hmget(fragment, fields, { blob: true });

	function stringify(blob: Readonly<Uint8Array> | null, map = false) {
		let visualsString = '';
		if (blob) {
			for (const visual of visualsReader(blob) as any[]) {
				if (map) {
					switch (visual[Variant]) {
						case 'l': {
							const p1 = Visual.decodeRoomPosition({ x: visual.x1 as number, y: visual.y1 as number });
							const p2 = Visual.decodeRoomPosition({ x: visual.x2 as number, y: visual.y2 as number });
							Object.assign(visual, { x1: p1.x, y1: p1.y, n1: p1.n, x2: p2.x, y2: p2.y, n2: p2.n });
							break;
						}
						case 'p':
							visual.points = visual.points.map((p: number[]) => Visual.decodeRoomPosition({ x: p[0], y: p[1] }));
							break;
						default:
							Object.assign(visual, Visual.decodeRoomPosition(visual));
					}
				}
				visual.t = visual[Variant];
				visualsString += stringifyInherited(visual) + '\n';
			}
		}
		return visualsString;
	}

	if (payload.time && typedArrayToString(payload.time) === `${shard.time}`) {
		if (roomName === 'map') {
			return stringify(payload[roomName], true);
		} else {
			return stringify(payload['*']) + stringify(payload[roomName]);
		}
	} else {
		return '';
	}
}

export async function publishVisualsBlobsForNextTick(shard: Shard, userId: string, payload: Map<string, Readonly<Uint8Array>>) {
	const time = shard.time + 1;
	const fragment = `user/${userId}/visual${time % 2}`;
	if (payload.size === 0) {
		await shard.scratch.vdel(fragment);
	} else {
		await Promise.all([
			shard.scratch.vdel(fragment),
			shard.scratch.hmset(fragment, [
				[ 'time', Buffer.from(`${time}`) ],
				...payload,
			]),
			getVisualChannel(shard, userId).publish({ type: 'publish', roomNames: [ ...payload.keys() ], time }),
		]);
	}
}
