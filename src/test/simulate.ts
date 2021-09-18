import type { Database, Shard } from 'xxscreeps/engine/db';
import type { GameConstructor } from 'xxscreeps/game';
import type { GameBase } from 'xxscreeps/game/game';
import type { Room } from 'xxscreeps/game/room';
import type { RoomIntentPayload } from 'xxscreeps/engine/processor/room';
import type { World } from 'xxscreeps/game/map';
import assert from 'assert';
import * as Fn from 'xxscreeps/utility/functional';
import { flushUsers } from 'xxscreeps/game/room/room';
import { begetRoomProcessQueue, finalizeExtraRoomsSetKey, processRoomsSetKey, updateUserRoomRelationships, userToIntentRoomsSetKey, userToVisibleRoomsSetKey } from 'xxscreeps/engine/processor/model';
import { consumeSet, consumeSortedSet } from 'xxscreeps/engine/db/async';
import { RoomProcessor } from 'xxscreeps/engine/processor/room';
import { Game, GameState, initializeGameEnvironment, runForUser, runOneShot, runWithState } from 'xxscreeps/game';
import { getOrSet } from 'xxscreeps/utility/utility';
import { instantiateTestShard } from 'xxscreeps/test/import';
import { initializeIntentConstraints } from 'xxscreeps/engine/processor';
import { importMods } from 'xxscreeps/config/mods';

import 'xxscreeps/config/mods/import/game';
await importMods('processor');
initializeGameEnvironment();
initializeIntentConstraints();

type Simulation = {
	db: Database;
	shard: Shard;
	world: World;

	/**
	 * Invokes the passed function in the context of a given user. The first and only argument is
	 * the user's `Game` object. Intents can be issued using normal game commands, and they will be
	 * dispatched when `tick` is called.
	 */
	player(userId: string, task: (game: GameConstructor) => void): Promise<void>;

	/**
	 * This behaves similarly to `player` but only one room will be loaded, regardless of whether or
	 * not the player can see the room. Crucially, you are allowed to modify the room however you
	 * want and it will be saved after the function returns. Intents issued will be discards.
	 */
	poke<Type>(roomName: string, userId: string | undefined, task: (game: GameConstructor, room: Room) => Type): Promise<Type>;

	/**
	 * Invokes the game processor to dispatch intents.
	 * @param count How many ticks to process.
	 * @param players Player implementations to run each tick.
	 */
	tick(
		count?: number,
		players?: Record<string, (game: GameConstructor) => void>): Promise<void>;

	// I think this was a bad idea, I would just recommend using `player` instead.
	peekRoom<Type>(roomName: string, task: (room: Room, game: GameBase) => Type): Promise<Type>;
};

/**
 * `simulate` creates a factory for a test shard. The shard terrain and initial objects are imported
 *  from `test/shard.json`. The test shard will match the results of `npx xxscreeps import` but
 *  without any bots. 4 users are created with ids '100' -> '103', but they do not own any objects
 *  by default.
 *
 * The only argument is a record of room names to instantiation code functions. These functions
 * will be invoked for each room and they can modify or add objects in the rooms.
 *
 * The return value of `simulate` is a function which can be invoked as many times as needed. Each
 * time it is invoked it will create a fresh shard given the room instantiation code. It will invoke
 * the supplied function with an object containing various references and utilities.
 */
export function simulate(rooms: Record<string, (room: Room) => void>) {
	return async(body: (refs: Simulation) => Promise<void>) => {

		const { db, shard, world } = await instantiateTestShard();
		try {
			// Initialize world
			await Promise.all(Fn.map(Object.entries(rooms), async([ roomName, callback ]) => {
				const room = await shard.loadRoom(roomName, shard.time);
				runOneShot(world, room, shard.time, '', () => callback(room));
				room['#flushObjects'](null);
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
			const that: Simulation = {
				db,
				shard,
				world,

				async peekRoom(roomName, task) {
					const room = await shard.loadRoom(roomName);
					return runOneShot(world, room, shard.time, '', () => task(room, Game));
				},

				async poke(roomName, userId, task) {
					const room = await shard.loadRoom(roomName);
					const state = new GameState(world, shard.time, [ room ]);
					const [ , result ] = runWithState(state, () => runForUser(userId ?? '', state, Game => task(Game, room)));
					room['#flushObjects'](state);
					const previousUsers = flushUsers(room);
					await Promise.all([
						shard.saveRoom(room.name, shard.time, room),
						updateUserRoomRelationships(shard, room, previousUsers),
					]);
					roomInstances.delete(roomName);
					return result;
				},

				async player(userId, task) {
					// Fetch game state for player
					const [ intentRooms, visibleRooms ] = await Promise.all([
						shard.scratch.smembers(userToIntentRoomsSetKey(userId)),
						shard.scratch.smembers(userToVisibleRoomsSetKey(userId)),
					]);
					const rooms = await Promise.all(Fn.map(visibleRooms, roomName => shard.loadRoom(roomName)));
					const state = new GameState(world, shard.time, rooms);
					const [ intents ] = runForUser(userId, state, task);

					// Save intents
					for (const roomName of intentRooms) {
						const roomIntents = intents.getIntentsForRoom(roomName);
						if (roomIntents) {
							getOrSet(intentsByRoom, roomName, () => []).push({ userId, intents: roomIntents });
						}
					}
				},

				async tick(count = 1, players = {}) {
					for (let ii = 0; ii < count; ++ii) {
						// Run player code
						for (const [ userId, task ] of Object.entries(players)) {
							await that.player(userId, task);
						}

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
						intentsByRoom.clear();

						// Second phase
						await Promise.all(Fn.map(contexts.values(), context => context.finalize(false)));
						for await (const roomName of consumeSet(shard.scratch, finalizeExtraRoomsSetKey(time))) {
							const room = roomInstances.get(roomName) ?? await shard.loadRoom(roomName);
							const context = new RoomProcessor(shard, world, room, time);
							await context.process(true);
							await context.finalize(true);
							nextRoomInstances.set(roomName, room);
						}

						// Increment time
						await shard.data.set('time', time);
						await shard.channel.publish({ type: 'tick', time });
						shard.time = time;
					}
				},
			};
			await body(that);
		} finally {
			shard.disconnect();
			db.disconnect();
		}
	};
}
