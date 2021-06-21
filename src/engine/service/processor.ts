import type { Room } from 'xxscreeps/game/room/room';
import * as Fn from 'xxscreeps/utility/functional';
import {
	acquireIntentsForRoom, begetRoomProcessQueue, finalizeExtraRoomsSetKey,
	getProcessorChannel, processRoomsSetKey, roomsDidFinalize, updateUserRoomRelationships,
} from 'xxscreeps/engine/processor/model';
import { Database, Shard } from 'xxscreeps/engine/db';
import { initializeIntentConstraints } from 'xxscreeps/engine/processor';
import { RoomProcessor } from 'xxscreeps/engine/processor/room';
import { consumeSet, consumeSortedSet, consumeSortedSetMembers } from 'xxscreeps/engine/db/async';
import { getServiceChannel } from '.';
import { lookAhead, mustNotReject } from 'xxscreeps/utility/async';

// Per-tick bookkeeping handles
const processedRooms = new Map<string, RoomProcessor>();
let nextRoomCache = new Map<string, Room>();
let roomCache = new Map<string, Room>();

// Process a single room, assumes that the room is actually ready to be processed
async function processRoom(time: number, roomName: string) {
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
}

// Updates current time based on a pubsub message. Handles affinity information.
let currentTime = -1;
let affinity: string[] = [];
function updateTime(time: number) {
	if (currentTime !== time) {
		// Setup for next tick
		roomCache = nextRoomCache;
		nextRoomCache = new Map;
		if (currentTime !== time - 1) {
			// Processor missed a whole tick! This data is no longer good.
			roomCache.clear();
		}
		currentTime = time;
		affinity = [ ...roomCache.keys() ];
	}
	return time;
}

// Connect to main & storage
const db = await Database.connect();
const shard = await Shard.connect(db, 'shard0');
const world = await shard.loadWorld();
const processorSubscription = await getProcessorChannel(shard).subscribe();
initializeIntentConstraints();
try {

	// Initialize rooms / user relationships
	for await (const roomName of consumeSet(shard.scratch, 'initializeRooms')) {
		const room = await shard.loadRoom(roomName, undefined, true);
		await updateUserRoomRelationships(shard, room);
	}

	// Wait for all processors to initialize
	const [ firstTime ] = await Promise.all([
		async function() {
			for await (const message of processorSubscription) {
				if (message.type === 'shutdown') {
					return -1;
				} else if (message.type === 'process') {
					return message.time;
				}
			}
			throw new Error('End of message stream');
		}(),
		getServiceChannel(shard).publish({ type: 'processorInitialized' }),
	]);
	if (firstTime === -1) {
		throw new Error('Processor initialization failure');
	}

	// Initialize processor queue, or sync up with existing processors
	currentTime = await begetRoomProcessQueue(shard, firstTime, firstTime - 1);
	let latch = 0;
	let nextTime = currentTime;
	for await (const message of processorSubscription) {

		if (message.type === 'shutdown') {
			break;

		} else if (message.type === 'process') {
			nextTime = message.time;
			if (++latch > 1) {
				continue;
			}
			mustNotReject(async() => {
				loop: while (true) {
					const time = updateTime(nextTime);
					const queueKey = processRoomsSetKey(time);

					// Check affinity rooms
					for await (const roomName of lookAhead(consumeSortedSetMembers(shard.scratch, queueKey, affinity, 0, 0), 1)) {
						await processRoom(time, roomName);
					}

					// Run one non-preferred room, then check affinity rooms again
					// eslint-disable-next-line no-unreachable-loop
					for await (const roomName of consumeSortedSet(shard.scratch, queueKey, 0, 0)) {
						await processRoom(time, roomName);
						continue loop;
					}

					// No extra rooms were run. Check to see if there's anything left in the affinity array.
					if (affinity.length === 0) {
						break;
					}
					const scores = await shard.scratch.zmscore(queueKey, affinity);
					affinity = [ ...Fn.filter(Fn.map(
						Fn.reject(Fn.range(affinity.length), ii => scores[ii] === null),
						ii => affinity[ii])) ];
					if (affinity.length === 0) {
						break;
					}

					// If an invocation was skipped while this function was running, we will continue looping.
					// Otherwise it's time to exit.
					if (latch === 1) {
						break;
					} else {
						latch = 1;
					}
				}
				latch = 0;
			});

		} else if (message.type === 'finalize') {
			// Second processing phase. This waits until all player code and first phase processing has
			// run.
			const { time } = message;
			await Promise.all(Fn.map(processedRooms.values(), context => context.finalize()));
			let count = processedRooms.size;
			// Also finalize rooms which were sent inter-room intents
			for await (const roomName of consumeSet(shard.scratch, finalizeExtraRoomsSetKey(time))) {
				const room = await shard.loadRoom(roomName, time - 1);
				const context = new RoomProcessor(shard, world, room, time);
				await context.process(true);
				await context.finalize();
				nextRoomCache.set(roomName, room);
				++count;
			}
			// Done
			processedRooms.clear();
			updateTime(await roomsDidFinalize(shard, count, time));
		}
	}

} finally {
	shard.disconnect();
	processorSubscription.disconnect();
}
