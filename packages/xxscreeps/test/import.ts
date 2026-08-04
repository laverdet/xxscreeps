import type { Payload } from 'xxscreeps/scripts/payload.js';
import * as fs from 'node:fs/promises';
import { loadTerrain } from 'xxscreeps/driver/pathfinder/pathfinder.js';
import { Database, Shard } from 'xxscreeps/engine/db/index.js';
import * as User from 'xxscreeps/engine/db/user/index.js';
import { Fn } from 'xxscreeps/functional/fn.js';
import * as MapSchema from 'xxscreeps/game/map.js';
import { importPayload } from 'xxscreeps/scripts/payload.js';
import { testRedis } from './context.js';

// Read file
const root = new URL('../../test/', import.meta.url);
const payload = JSON.parse(await fs.readFile(new URL('../test/data/shard.json', root), 'utf8')) as Payload;

const { rooms, terrain } = importPayload(payload);
export const testWorld = new MapSchema.World('test', terrain);
// Seeds the path finder's global terrain as a side effect of importing this module.
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
		shard.data.sAdd('rooms', rooms.map(room => room.name)),
		Promise.all(Fn.map(rooms, async room => {
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
