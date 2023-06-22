import type { Payload } from './export.js';
import type { RoomObject } from 'xxscreeps/game/object.js';
import fs from 'fs/promises';
import C from 'xxscreeps/game/constants/index.js';
import Fn from 'xxscreeps/utility/functional.js';
import * as MapSchema from 'xxscreeps/game/map.js';
import * as User from 'xxscreeps/engine/db/user/index.js';
import { Database, Shard } from 'xxscreeps/engine/db/index.js';
import { makeWriter } from 'xxscreeps/schema/write.js';
import { loadTerrain } from 'xxscreeps/driver/path-finder.js';
import { processorTimeKey } from 'xxscreeps/engine/processor/model.js';
import { TerrainWriter, packExits } from 'xxscreeps/game/terrain.js';
import { RoomPosition } from 'xxscreeps/game/position.js';
import { StructureController } from 'xxscreeps/mods/controller/controller.js';
import { Source } from 'xxscreeps/mods/source/source.js';
import { Room } from 'xxscreeps/game/room/index.js';
import { Mineral } from 'xxscreeps/mods/mineral/mineral.js';

// Read file
const root = new URL('../../test/', import.meta.url);
const payload: Payload = JSON.parse(await fs.readFile(new URL('shard.json', root), 'utf8'));

// Generate rooms
const rooms = Object.entries(payload).map(([ roomName, info ]) => {
	const terrain = new TerrainWriter;
	const room = new Room;
	room.name = roomName;

	let ii = 0;
	type Metadata = Extract<Payload[string]['objects'], any[]>[any];
	const saveObject = (object: RoomObject, xx: number, yy: number, fn?: (metadata: Metadata) => void) => {
		const metadata = info.objects![ii++]!;
		object.id = metadata.id;
		object.pos = new RoomPosition(xx, yy, room.name);
		object['#posId'] = object.pos['#id'];
		fn?.(metadata);
		room['#insertObject'](object);
	};

	for (const [ yy, line ] of info.layout.entries()) {
		for (const [ xx, character ] of [ ...line as Iterable<string> ].entries()) {
			switch (character) {
				case ' ': break;
				case '#':
					terrain.set(xx, yy, C.TERRAIN_MASK_WALL);
					break;

				case ',':
					terrain.set(xx, yy, C.TERRAIN_MASK_SWAMP);
					break;

				case '@': {
					terrain.set(xx, yy, C.TERRAIN_MASK_WALL);
					const controller = new StructureController;
					room['#user'] = null;
					saveObject(controller, xx, yy);
					break;
				}

				case 'E': {
					terrain.set(xx, yy, C.TERRAIN_MASK_WALL);
					const source = new Source;
					source.energy =
					source.energyCapacity = C.SOURCE_ENERGY_NEUTRAL_CAPACITY;
					saveObject(source, xx, yy);
					break;
				}

				case 'M': {
					terrain.set(xx, yy, C.TERRAIN_MASK_WALL);
					const mineral = new Mineral;
					saveObject(mineral, xx, yy, metadata => {
						mineral.density = metadata.density!;
						mineral.mineralType = metadata.mineral!;
						mineral.mineralAmount = C.MINERAL_DENSITY[mineral.density]!;
					});
				}
			}
		}
	}
	room['#flushObjects'](null);
	return { room, terrain };
});

// Initialize world terrain blob & path finder
const terrainMap = new Map(Fn.map(rooms, ({ room, terrain }) => [
	room.name, {
		exits: packExits(terrain),
		terrain,
	},
]));
const terrain = makeWriter(MapSchema.schema)(terrainMap);
const world = new MapSchema.World('test', terrain);
loadTerrain(world);

// Default users
const users = {
	1: 'Screeps',
	2: 'Invader',
	3: 'Source Keeper',
	100: 'Player 1',
	101: 'Player 2',
};

export async function instantiateTestShard() {
	// Create fake database
	const db = await Database.connect({
		data: 'local://data',
		pubsub: 'local://pubsub',
	});
	const shard = await Shard.connectWith(db, {
		name: 'shard0',
		data: 'local://keyval',
		pubsub: 'local://pubsub',
		scratch: 'local://scratch',
	});

	// Save to fake database
	// nb: This skips the `refreshRoom` stage. This step may need to be added later but isn't
	// needed right now.
	shard.time = 1;
	await Promise.all([
		shard.data.set('terrain', terrain),
		shard.data.set('time', shard.time),
		shard.data.sadd('rooms', [ ...Fn.map(rooms, room => room.room.name) ]),
		shard.scratch.set(processorTimeKey, shard.time),
		Promise.all(Fn.map(rooms, ({ room }) =>
			shard.saveRoom(room.name, shard.time, room))),
		Promise.all(Fn.map(Object.entries(users), ([ userId, username ]) =>
			User.create(db, userId, username))),
	]);

	return { db, shard, world };
}
