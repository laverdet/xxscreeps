import type { Room } from 'xxscreeps/game/room/room.js';
import Fn from 'xxscreeps/utility/functional.js';
import { importMods } from 'xxscreeps/config/mods/index.js';
import { acquireIntentsForRoom, finalizeExtraRoomsSetKey, roomsDidFinalize, updateUserRoomRelationships } from 'xxscreeps/engine/processor/model.js';
import { Database, Shard } from 'xxscreeps/engine/db/index.js';
import { initializeIntentConstraints } from 'xxscreeps/engine/processor/index.js';
import { RoomProcessor } from 'xxscreeps/engine/processor/room.js';
import { consumeSet } from 'xxscreeps/engine/db/async.js';
import { hooks } from 'xxscreeps/engine/processor/symbols.js';
import { loadTerrain } from 'xxscreeps/driver/path-finder.js';
import { makeBasicResponderHost } from 'xxscreeps/utility/responder.js';
import { initializeGameEnvironment } from 'xxscreeps/game/index.js';
import { World } from 'xxscreeps/game/map.js';

import 'xxscreeps/config/mods/import/game.js';
await importMods('driver');
await importMods('processor');

export type ProcessorRequest = LoadWorldRequest | InitializeRequest | ProcessRequest | FinalizeRequest;

type LoadWorldRequest = {
	type: 'world';
	worldBlob: Readonly<Uint8Array>;
};
type InitializeRequest = {
	type: 'initialize';
	roomName: string;
};
type ProcessRequest = {
	type: 'process';
	roomName: string;
	time: number;
};
type FinalizeRequest = {
	type: 'finalize';
	time: number;
};

// Hooks
const refreshRoom = hooks.makeMapped('refreshRoom');
initializeGameEnvironment();
initializeIntentConstraints();

// Per-tick bookkeeping handles
const processedRooms = new Map<string, RoomProcessor>();
let cacheTime: number;
let nextRoomCache = new Map<string, Room>();
let roomCache = new Map<string, Room>();
let world: World;

// Connect to storage
const db = await Database.connect();
const shard = await Shard.connect(db, 'shard0');

try {
	// Create responder host and listen for requests
	await makeBasicResponderHost<ProcessorRequest>(import.meta.url, async message => {
		switch (message.type) {
			// Load world shared data between all workers in the process
			case 'world':
				world = new World(shard.name, message.worldBlob);
				loadTerrain(world);
				break;

			// Initialize rooms / user relationships
			case 'initialize': {
				const room = await shard.loadRoom(message.roomName, undefined, true);
				await Promise.all([
					updateUserRoomRelationships(shard, room),
					...refreshRoom(shard, room),
				]);
				break;
			}

			// Process a single room
			case 'process': {
				// Flush cache if time has changed
				const { roomName, time } = message;
				if (cacheTime !== time) {
					if (cacheTime === time - 1) {
						roomCache = nextRoomCache;
					} else {
						roomCache = new Map;
					}
					cacheTime = time;
					nextRoomCache = new Map;
				}

				// Read room data and intents from storage
				const [ room, intentsPayloads ] = await Promise.all([
					function() {
						const room = roomCache.get(roomName);
						if (room) {
							return room;
						} else {
							return shard.loadRoom(roomName, time - 1);
						}
					}(),
					acquireIntentsForRoom(shard, roomName),
				]);

				// Create processor context and add intents
				const context = new RoomProcessor(shard, world, room, time);
				for (const { userId, intents } of intentsPayloads) {
					context.saveIntents(userId, intents);
				}

				// Run first process phase
				processedRooms.set(roomName, context);
				nextRoomCache.set(roomName, room);
				await context.process();
				break;
			}

			// Second processing phase. This waits until all player code and first phase processing has run.
			case 'finalize': {
				const { time } = message;
				// Finalize rooms from first phase
				await Promise.all(Fn.map(processedRooms.values(), context => context.finalize(false)));
				let count = processedRooms.size;
				// Also finalize rooms which were sent inter-room intents
				for await (const roomName of consumeSet(shard.scratch, finalizeExtraRoomsSetKey(time))) {
					const room = await shard.loadRoom(roomName, time - 1);
					const context = new RoomProcessor(shard, world, room, time);
					await context.process(true);
					await context.finalize(true);
					nextRoomCache.set(roomName, room);
					++count;
				}
				// Done
				processedRooms.clear();
				await roomsDidFinalize(shard, count, time);
				break;
			}
		}
	});

} finally {
	shard.disconnect();
	db.disconnect();
}
