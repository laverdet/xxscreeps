import type { Payload } from './export.js';
import type { RoomObject } from 'xxscreeps/game/object.js';
import * as fs from 'node:fs/promises';
import { loadTerrain } from 'xxscreeps/driver/pathfinder/pathfinder.js';
import { Database, Shard } from 'xxscreeps/engine/db/index.js';
import * as User from 'xxscreeps/engine/db/user/index.js';
import { Fn } from 'xxscreeps/functional/fn.js';
import * as C from 'xxscreeps/game/constants/index.js';
import * as MapSchema from 'xxscreeps/game/map.js';
import { RoomPosition } from 'xxscreeps/game/position.js';
import { Room } from 'xxscreeps/game/room/index.js';
import { computeRoomMeta } from 'xxscreeps/game/room/sector.js';
import { TerrainWriter, packExits } from 'xxscreeps/game/terrain.js';
import { StructureController } from 'xxscreeps/mods/controller/controller.js';
import { Mineral } from 'xxscreeps/mods/mineral/mineral.js';
import { Source } from 'xxscreeps/mods/source/source.js';
import { makeWriter } from 'xxscreeps/schema/write.js';
import { testRedis } from './context.js';

// Read file
const root = new URL('../../test/', import.meta.url);
const payload: Payload = JSON.parse(await fs.readFile(new URL('../test/data/shard.json', root), 'utf8'));

// Generate rooms
const rooms = Object.entries(payload).map(([ roomName, info ]) => {
	const terrain = new TerrainWriter();
	const room = new Room();
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
					const controller = new StructureController();
					room['#user'] = null;
					saveObject(controller, xx, yy);
					break;
				}

				case 'E': {
					terrain.set(xx, yy, C.TERRAIN_MASK_WALL);
					const source = new Source();
					source.energy =
						source.energyCapacity = C.SOURCE_ENERGY_NEUTRAL_CAPACITY;
					saveObject(source, xx, yy);
					break;
				}

				case 'M': {
					terrain.set(xx, yy, C.TERRAIN_MASK_WALL);
					const mineral = new Mineral();
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
const roomNames = new Set(Fn.map(rooms, ({ room }) => room.name));
const terrainMap = new Map(Fn.map(rooms, ({ room, terrain }) => [
	room.name, {
		exits: packExits(terrain),
		terrain,
		...computeRoomMeta(room.name, roomNames),
	},
]));
const terrain = makeWriter(MapSchema.schema)(terrainMap);
export const testWorld = new MapSchema.World('test', terrain);
loadTerrain(testWorld);

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
	await using disposable = new AsyncDisposableStack();
	const { db, shard } = await async function() {
		if (testRedis) {
			const db = disposable.use(await Database.connect({
				data: 'redis://localhost/7',
				pubsub: 'redis://localhost/7',
			}));
			const shard = disposable.use(await Shard.connectWith(db, {
				name: 'shard0',
				data: 'redis://localhost/8',
				pubsub: 'redis://localhost/8',
				scratch: 'redis://localhost/9',
			}));
			return { db, shard };
		} else {
			const db = disposable.use(await Database.connect({
				data: 'local://data',
				pubsub: 'local://pubsub',
			}));
			const shard = disposable.use(await Shard.connectWith(db, {
				name: 'shard0',
				data: 'local://keyval',
				pubsub: 'local://pubsub',
				scratch: 'local://scratch',
			}));
			return { db, shard };
		}
	}();

	// Reset all stores so shared `local://` singletons start clean
	await Promise.all([
		db.data.flushdb(),
		shard.data.flushdb(),
		shard.scratch.flushdb(),
	]);

	// Save to fake database
	// nb: This skips the `refreshRoom` stage. This step may need to be added later but isn't
	// needed right now.
	shard.time = 0;
	await Promise.all([
		shard.data.set('terrain', terrain),
		shard.data.set('time', shard.time),
		shard.data.sAdd('rooms', [ ...Fn.map(rooms, room => room.room.name) ]),
		Promise.all(Fn.map(rooms, async ({ room }) => {
			await shard.saveRoom(room.name, shard.time, room);
			await shard.copyRoomFromPreviousTick(room.name, shard.time + 1);
		})),
		Promise.all(Fn.map(Object.entries(users), ([ userId, username ]) =>
			User.create(db, userId, username))),
	]);

	return {
		[Symbol.asyncDispose]: function(disposable) {
			return () => disposable.disposeAsync();
		}(disposable.move()),
		db,
		shard,
		world: testWorld,
	};
}
