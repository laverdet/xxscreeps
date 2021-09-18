import fs from 'fs/promises';
import * as C from 'xxscreeps/game/constants';
import type { Mineral } from 'xxscreeps/mods/mineral/mineral';
import type { Structure } from 'xxscreeps/mods/structure/structure';
import * as Fn from 'xxscreeps/utility/functional';
import { Database, Shard } from 'xxscreeps/engine/db';
import { parseRoomName } from 'xxscreeps/game/position';
import 'xxscreeps/config/mods/import/game';
export type Payload = typeof payload;

const db = await Database.connect();
const shard = await Shard.connect(db, 'shard0');
const map = await shard.loadWorld();
const terrainMask = [ ' ', '#', ',', '?' ];

// Sort map so that rooms will be continuous in the JSON top to bottom, left to right.
const roomNames = [ ...Fn.map(map.entries(), ([ roomName ]) => roomName) ].sort((left, right) => {
	const leftR = parseRoomName(left);
	const rightR = parseRoomName(right);
	return (leftR.rx - rightR.rx) || (leftR.ry - rightR.ry);
});
const entriesSorted = new Map(Fn.map(roomNames, roomName => [ roomName, map.map.getRoomTerrain(roomName) ]));

// Render room terrain + object string representation
const payload = Fn.fromEntries(await Fn.mapAsync(entriesSorted, async([ roomName, terrain ]) => {
	const room = await shard.loadRoom(roomName);
	const objects = new Map(Fn.filter(Fn.map(room['#objects'], object => {
		const info = function() {
			switch (object['#lookType']) {
				case 'structure':
					return (object as Structure).structureType === C.STRUCTURE_CONTROLLER ? { marker: '@' } : undefined;
				case 'mineral': return {
					marker: 'M',
					meta: {
						density: (object as Mineral).density,
						mineral: (object as Mineral).mineralType,
					},
				};
				case 'source': return { marker: 'E' };
				default:
			}
		}();
		if (info) {
			return [ `${object.pos.x},${object.pos.y}`, {
				marker: info.marker,
				meta: {
					id: object.id,
					...info.meta,
				},
			} ];
		}
	})));
	const metadata: typeof objects extends Map<any, { meta: infer T }> ? T[] : never = [];
	const layout = [ ...Fn.map(Fn.range(50), yy => [
		...Fn.map(Fn.range(50), xx => {
			const object = objects.get(`${xx},${yy}`);
			if (object) {
				metadata.push(object.meta);
				return object.marker;
			} else {
				return terrainMask[terrain.get(xx, yy)];
			}
		}),
	].join('')) ];
	return [ roomName, { layout, objects: metadata.length > 0 ? metadata : undefined } ];
}));

const file = process.argv[2];
if (!file.endsWith('.json')) {
	throw new Error('Destination must be .json file');
}
await fs.writeFile(file, JSON.stringify(payload, null, 1));
