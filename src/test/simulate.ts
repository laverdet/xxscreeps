import type { Database, Shard } from 'xxscreeps/engine/db';
import type { GameConstructor } from 'xxscreeps/game';
import type { Room } from 'xxscreeps/game/room';
import type { RoomIntentPayload } from 'xxscreeps/engine/processor/room';
import type { World } from 'xxscreeps/game/map';
import assert from 'assert';
import * as Fn from 'xxscreeps/utility/functional';
import { flushUsers } from 'xxscreeps/game/room/room';
import { begetRoomProcessQueue, processRoomsSetKey, updateUserRoomRelationships, userToIntentRoomsSetKey } from 'xxscreeps/engine/processor/model';
import { consumeSortedSet } from 'xxscreeps/engine/db/async';
import { RoomProcessor } from 'xxscreeps/engine/processor/room';
import { GameState, initializeGameEnvironment, runForUser, runOneShot } from 'xxscreeps/game';
import { getOrSet } from 'xxscreeps/utility/utility';
import { instantiateTestShard } from 'xxscreeps/test/import';
import { initializeIntentConstraints } from 'xxscreeps/engine/processor';
import { importMods } from 'xxscreeps/config/mods';

import 'xxscreeps/config/mods/import/game';
await importMods('processor');
initializeGameEnvironment();
initializeIntentConstraints();

export function simulate(rooms: Record<string, (room: Room) => void>) {
	return async(body: (refs: {
		db: Database;
		shard: Shard;
		world: World;
		player: (userId: string, task: (game: GameConstructor) => void) => Promise<void>;
		tick: (count?: number) => Promise<void>;
		withRoom: (roomName: string, task: (room: Room) => void) => Promise<void>;
	}) => Promise<void>) => {

		const { db, shard, world } = await instantiateTestShard();
		try {
			// Initialize world
			await Promise.all(Fn.map(Object.entries(rooms), async([ roomName, callback ]) => {
				const room = await shard.loadRoom(roomName, shard.time);
				runOneShot(world, room, shard.time, '', () => callback(room));
				room['#flushObjects']();
				const previousUsers = flushUsers(room);
				await Promise.all([
					shard.saveRoom(room.name, shard.time + 1, room),
					shard.saveRoom(room.name, shard.time, room),
					updateUserRoomRelationships(shard, room, previousUsers),
				]);
			}));

			// Run simulation
			const intentsByRoom = new Map<string, { userId: string; intents: RoomIntentPayload }[]>();
			let roomInstances = new Map<string, Room>();
			await body({
				db,
				shard,
				world,

				async withRoom(roomName, task) {
					const room = await shard.loadRoom(roomName, shard.time);
					runOneShot(world, room, shard.time, '', () => task(room));
				},

				async player(userId, task) {
					// Fetch game state for player
					const roomNames = await shard.scratch.smembers(userToIntentRoomsSetKey(userId));
					const rooms = await Promise.all(Fn.map(roomNames, roomName => shard.loadRoom(roomName)));
					const state = new GameState(world, shard.time, rooms);
					const [ intents ] = runForUser(userId, state, task);

					// Save intents
					for (const roomName of roomNames) {
						const roomIntents = intents.getIntentsForRoom(roomName);
						if (roomIntents) {
							getOrSet(intentsByRoom, roomName, () => []).push({ userId, intents: roomIntents });
						}
					}
				},

				async tick(count = 1) {
					for (let ii = 0; ii < count; ++ii) {
						// Initialize processor queue
						const time = shard.time + 1;
						const processorTime = await begetRoomProcessQueue(shard, time, time - 1);
						assert.equal(time, processorTime);
						const nextRoomInstances = new Map<string, Room>();
						const contexts = new Map<string, RoomProcessor>();

						// First phase
						for await (const roomName of consumeSortedSet(shard.scratch, processRoomsSetKey(time), 0, Infinity)) {
							const room = roomInstances.get(roomName) ?? await shard.loadRoom(roomName);
							nextRoomInstances.set(roomName, room);
							const context = new RoomProcessor(shard, world, room, time);
							contexts.set(roomName, context);
							for (const { userId, intents } of intentsByRoom.get(roomName) ?? []) {
								context.saveIntents(userId, intents);
							}
							await context.process();
						}
						roomInstances = nextRoomInstances;

						// Second phase
						await Promise.all(Fn.map(contexts.values(), context => context.finalize()));

						// Increment time
						await shard.data.set('time', time);
						await shard.channel.publish({ type: 'tick', time });
						shard.time = time;
					}
				},
			});
		} finally {
			shard.disconnect();
			db.disconnect();
		}
	};
}
