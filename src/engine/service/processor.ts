import type { Room } from 'xxscreeps/game/room/room';
import * as Fn from 'xxscreeps/utility/functional';
import {
	acquireIntentsForRoom, begetRoomProcessQueue, finalizeExtraRoomsSetKey,
	getProcessorChannel, processRoomsSetKey, roomsDidFinalize, updateUserRoomRelationships,
} from 'xxscreeps/engine/processor/model';
import { Database, Shard } from 'xxscreeps/engine/db';
import { RoomProcessorContext } from 'xxscreeps/engine/processor/room';
import { consumeSet, consumeSortedSet } from 'xxscreeps/engine/db/async';
import { getServiceChannel } from '.';

// Keep track of rooms this thread ran. Global room processing must also happen here.
const processedRooms = new Map<string, RoomProcessorContext>();
const nextRoomCache = new Map<string, Room>();
let roomCache = new Map<string, Room>();

// Connect to main & storage
const db = await Database.connect();
const shard = await Shard.connect(db, 'shard0');
const world = await shard.loadWorld();
const processorSubscription = await getProcessorChannel(shard).subscribe();

try {

	// Initialize rooms / user relationships
	for await (const roomName of consumeSet(shard.scratch, 'initializeRooms')) {
		const room = await shard.loadRoom(roomName, undefined, true);
		await updateUserRoomRelationships(shard, room);
	}

	// Start the processing loop
	await getServiceChannel(shard).publish({ type: 'processorInitialized' });
	let currentTime = -1;
	for await (const message of processorSubscription) {

		if (message.type === 'shutdown') {
			break;

		} else if (message.type === 'process') {
			// Start first processing phase
			const { time } = message;
			currentTime = await begetRoomProcessQueue(shard, currentTime, time);
			for await (const roomName of consumeSortedSet(shard.scratch, processRoomsSetKey(time), 0, 0)) {
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
					acquireIntentsForRoom(shard, roomName, time),
				]);

				// Create processor context and add intents
				const context = new RoomProcessorContext(shard, world, room, time);
				for (const { userId, intents } of intentsPayloads) {
					context.saveIntents(userId, intents);
				}

				// Run first process phase
				await context.process();
				processedRooms.set(roomName, context);
				nextRoomCache.set(roomName, room);
			}

		} else if (message.type === 'finalize') {
			// Second processing phase. This waits until all player code and first phase processing has
			// run.
			const { time } = message;
			await Promise.all(Fn.map(processedRooms.values(), context => context.finalize()));
			let count = processedRooms.size;
			// Also finalize rooms which were sent inter-room intents
			for await (const roomName of consumeSet(shard.scratch, finalizeExtraRoomsSetKey(time))) {
				const room = await shard.loadRoom(roomName, time - 1);
				const context = new RoomProcessorContext(shard, world, room, time);
				await context.process(true);
				await context.finalize();
				nextRoomCache.set(roomName, room);
				++count;
			}
			// Done
			await roomsDidFinalize(shard, count, time);
			processedRooms.clear();
			roomCache = nextRoomCache;
			nextRoomCache.clear();
		}
	}

} finally {
	shard.disconnect();
	processorSubscription.disconnect();
}
