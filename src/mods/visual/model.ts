import type { Shard } from 'xxscreeps/engine/db/index.js';
import * as Visual from 'xxscreeps/mods/visual/visual.js';
import { Variant, assertVariant, makeReader } from 'xxscreeps/schema/index.js';
import { Channel } from 'xxscreeps/engine/db/channel.js';
import { stringifyInherited, typedArrayToString } from 'xxscreeps/utility/string.js';
import Fn from 'xxscreeps/utility/functional.js';

export function getVisualChannel(shard: Shard, userId: string) {
	type Message = { type: 'publish'; roomNames: string[]; time: number };
	return new Channel<Message>(shard.pubsub, `user/${userId}/visual`);
}

const visualsReader = makeReader(Visual.schema);

export async function loadVisuals(shard: Shard, userId: string, roomName: string) {
	const fragment = `user/${userId}/visual${shard.time % 2}`;
	const fields = [ 'time', roomName ];
	if (roomName !== 'map') {
		fields.push('*');
	}
	const payload = await shard.scratch.hmget(fragment, fields, { blob: true });

	function stringify(blob: Readonly<Uint8Array> | null, isMapVisual = false) {
		let visualsString = '';
		if (blob) {
			const visuals = visualsReader(blob);
			const decoded = isMapVisual ? Fn.map(visuals, visual => {
				switch (visual[Variant]) {
					case 'l': {
						assertVariant(visual, 'l');
						const p1 = Visual.decodeRoomPosition({ x: visual.x1, y: visual.y1 });
						const p2 = Visual.decodeRoomPosition({ x: visual.x2, y: visual.y2 });
						return Object.assign(visual, {
							x1: p1.x,
							y1: p1.y,
							n1: p1.n,
							x2: p2.x,
							y2: p2.y,
							n2: p2.n,
						});
					}
					case 'p': {
						assertVariant(visual, 'p');
						return Object.assign(visual, {
							...visual,
							points: visual.points.map(point => Visual.decodeRoomPosition({ x: point[0], y: point[1] })),
						});
					}
					default: return visual;
				}
			}) : visuals;
			for (const visual of decoded) {
				// @ts-expect-error
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
				[ 'time', Uint8Array.from(Buffer.from(`${time}`)) ],
				...payload,
			]),
			getVisualChannel(shard, userId).publish({ type: 'publish', roomNames: [ ...payload.keys() ], time }),
		]);
	}
}
