import * as Fn from 'xxscreeps/utility/functional';
import {
	acquireIntentsForRoom, begetRoomProcessQueue, getProcessorChannel, processRoomsSetKey,
	roomDidProcess, roomsDidFinalize, sleepRoomUntil, updateUserRoomRelationships,
} from 'xxscreeps/engine/model/processor';
import { Shard } from 'xxscreeps/engine/model/shard';
import { getUsersInRoom } from 'xxscreeps/game/room/room';
import { loadTerrainFromBuffer } from 'xxscreeps/game/map';
import { RoomProcessorContext } from 'xxscreeps/processor/room';
import { consumeSet, consumeSortedSet } from 'xxscreeps/storage/async';
import { getServiceChannel } from '.';

// Keep track of rooms this thread ran. Global room processing must also happen here.
const processedRooms = new Map<string, RoomProcessorContext>();

// Connect to main & storage
const shard = await Shard.connect('shard0');
const processorSubscription = await getProcessorChannel(shard).subscribe();
loadTerrainFromBuffer(shard.terrainBlob);

try {

	// Initialize rooms / user relationships
	for await (const roomName of consumeSet(shard.scratch, 'initializeRooms')) {
		const room = await shard.loadRoom(roomName);
		const userIds = getUsersInRoom(room);
		await updateUserRoomRelationships(shard, roomName, userIds);
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
					shard.loadRoom(roomName, time - 1),
					acquireIntentsForRoom(shard, roomName, time),
				]);

				// Create processor context and add intents
				const context = new RoomProcessorContext(room, time);
				for (const { userId, intents } of intentsPayloads) {
					context.saveIntents(userId, intents);
				}

				// Run first process phase
				context.process();
				processedRooms.set(roomName, context);
				await roomDidProcess(shard, roomName, time);
			}

		} else if (message.type === 'finalize') {
			// Second processing phase. This waits until all player code and first phase processing has
			// run.
			const { time } = message;
			await Promise.all(Fn.map(processedRooms, async([ roomName, context ]) => {
				const userIds = getUsersInRoom(context.room);
				await Promise.all([
					// Update room to user map
					await updateUserRoomRelationships(shard, roomName, userIds),
					// Save updated room blob
					function() {
						if (context.receivedUpdate) {
							return shard.saveRoom(roomName, time, context.room);
						} else {
							return shard.copyRoomFromPreviousTick(roomName, time);
						}
					}(),
				]);
				// Mark inactive if needed. Must be *after* saving room, because this copies from current
				// tick.
				if (userIds.size === 0 && context.nextUpdate !== time + 1) {
					return sleepRoomUntil(shard, roomName, time, context.nextUpdate);
				}
			}));
			await roomsDidFinalize(shard, processedRooms.size, time);
			processedRooms.clear();
		}
	}

} finally {
	shard.disconnect();
	processorSubscription.disconnect();
}
