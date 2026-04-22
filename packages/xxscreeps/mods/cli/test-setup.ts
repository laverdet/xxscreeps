// Shared test setup for cli/test.ts and cli/test-socket.ts; Node's module
// cache keeps the top-level side effects to a single execution.
import type { RoomIntentPayload } from 'xxscreeps/engine/processor/room.js';
import type { Room } from 'xxscreeps/game/room/index.js';
import { importMods } from 'xxscreeps/config/mods/index.js';
import { consumeSet, consumeSortedSet } from 'xxscreeps/engine/db/async.js';
import { initializeIntentConstraints } from 'xxscreeps/engine/processor/index.js';
import { acquireIntentsForRoom, begetRoomProcessQueue, finalizeExtraRoomsSetKey, processRoomsSetKey, pushIntentsForRoomNextTick } from 'xxscreeps/engine/processor/model.js';
import { RoomProcessor } from 'xxscreeps/engine/processor/room.js';
import { getInvalidationChannel } from 'xxscreeps/engine/service/invalidation.js';
import { initializeGameEnvironment } from 'xxscreeps/game/index.js';
import { instantiateTestShard } from 'xxscreeps/test/import.js';
import { PauseCoordinator } from './sandbox.js';
import 'xxscreeps/config/mods/import/game.js';

// 'processor' is loaded so intents pushed by bots.add etc. have registered
// handlers; `tickProcessor` below exercises the same pipeline as the server.
await importMods('processor');
await importMods('cli');
initializeGameEnvironment();
initializeIntentConstraints();

export const { db, shard, world } = await instantiateTestShard();
// Shared across test sandboxes so cross-sandbox pause tests match live behavior.
export const pause = new PauseCoordinator();

// Worker-style room cache mirroring engine/processor/worker.ts. Module-level
// so it survives across tickProcessor calls within a test session.
let roomCache = new Map<string, Room>();
let nextRoomCache = new Map<string, Room>();
let cacheTime: number | undefined;

// Honor the same invalidation contract workers follow, so a poke under test
// sees the eviction the live worker would.
const invalidationSubscription = await getInvalidationChannel(shard).subscribe();
invalidationSubscription.listen(message => {
	switch (message.type) {
		case 'room':
			roomCache.delete(message.roomName);
			nextRoomCache.delete(message.roomName);
			break;
		case 'world':
			roomCache.clear();
			nextRoomCache.clear();
			break;
		case 'accessibleRooms':
			// Doesn't touch room blobs; leave the cache intact.
			break;
	}
});

/** Push an intent payload for the next tick; wrapper around the canonical helper. */
export function pushIntentForTest(roomName: string, userId: string, intents: RoomIntentPayload) {
	return pushIntentsForRoomNextTick(shard, roomName, userId, intents);
}

/** Advance `count` processor ticks on the shared test shard. Mirrors the
 * worker's process/finalize pipeline so the invalidation contract is
 * exercised end-to-end. */
export async function tickProcessor(count = 1) {
	for (let ii = 0; ii < count; ++ii) {
		const time = shard.time + 1;
		// Roll the cache forward on sequential ticks; wipe on time regression
		// (e.g., a re-seeded shard) to avoid stale Rooms against fresh blobs.
		if (cacheTime === time - 1) {
			roomCache = nextRoomCache;
		} else {
			roomCache = new Map();
		}
		nextRoomCache = new Map();
		cacheTime = time;

		await begetRoomProcessQueue(shard, time, time - 1);
		const contexts = new Map<string, RoomProcessor>();
		const processedRooms = new Set<string>();
		for await (const roomName of consumeSortedSet(shard.scratch, processRoomsSetKey(time), 0, Infinity)) {
			processedRooms.add(roomName);
			const [ room, intentsPayloads ] = await Promise.all([
				roomCache.get(roomName) ?? shard.loadRoom(roomName),
				acquireIntentsForRoom(shard, roomName),
			]);
			nextRoomCache.set(roomName, room);
			const context = new RoomProcessor(shard, world, room, time);
			for (const { userId, intents } of intentsPayloads) {
				context.saveIntents(userId, intents);
			}
			contexts.set(roomName, context);
			await context.process();
		}
		// Copy-forward rooms outside the queue so an even-time loadRoom()
		// doesn't miss a blob that only exists in the odd slot.
		const allRooms = await shard.data.smembers('rooms');
		await Promise.all(allRooms.filter(roomName => !processedRooms.has(roomName)).map(
			roomName => shard.copyRoomFromPreviousTick(roomName, time)));
		await Promise.all([ ...contexts.values() ].map(context => context.finalize(false)));
		for await (const roomName of consumeSet(shard.scratch, finalizeExtraRoomsSetKey(time))) {
			const room = await shard.loadRoom(roomName);
			const context = new RoomProcessor(shard, world, room, time);
			await context.process(true);
			await context.finalize(true);
			nextRoomCache.set(roomName, room);
		}
		await shard.data.set('time', time);
		await shard.channel.publish({ type: 'tick', time });
		shard.time = time;
	}
}
