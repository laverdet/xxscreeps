import * as Fn from 'xxscreeps/utility/functional';
import { RoomProcessorContext } from 'xxscreeps/processor/room';
import { flushExtraIntentsForRoom, flushRunnerIntentsForRoom } from 'xxscreeps/engine/model/processor';
import { Shard } from 'xxscreeps/engine/model/shard';
import { loadTerrainFromBuffer } from 'xxscreeps/game/map';
import { Channel } from 'xxscreeps/storage/channel';
import { Queue } from 'xxscreeps/storage/queue';
import { ProcessorMessage, ProcessorQueueElement } from '.';

// Keep track of rooms this thread ran. Global room processing must also happen here.
const processedRooms = new Map<string, RoomProcessorContext>();

// Connect to main & storage
const shard = await Shard.connect('shard0');
const roomsQueue = Queue.connect<ProcessorQueueElement>(shard.storage, 'processRooms', true);
const processorChannel = await new Channel<ProcessorMessage>(shard.storage, 'processor').subscribe();

// Initialize world terrain
loadTerrainFromBuffer(shard.terrainBlob);

// Start the processing loop
let gameTime = -1;
await processorChannel.publish({ type: 'processorConnected' });
try {
	for await (const message of processorChannel) {

		if (message.type === 'shutdown') {
			break;

		} else if (message.type === 'processRooms') {
			// First processing phase. Can start as soon as all players with visibility into this room
			// have run their code
			gameTime = message.time;
			roomsQueue.version(`${gameTime}`);
			for await (const { room: roomName, users } of roomsQueue) {
				// Read room data and intents from storage
				const [ room, intentsFromUsers, extraIntents ] = await Promise.all([
					shard.loadRoom(roomName, gameTime - 1),
					Promise.all(Fn.map(users, async user => {
						const intents = await flushRunnerIntentsForRoom(shard, roomName, user);
						return { user, intents };
					})),
					flushExtraIntentsForRoom(shard, roomName, gameTime),
				]);

				// Create processor context and add intents
				const intentsByUser = new Map(Fn.map(intentsFromUsers, ({ user, intents }) => [ user, intents ]));
				const context = new RoomProcessorContext(room, gameTime, intentsByUser);
				for (const { user, intents } of extraIntents) {
					context.saveIntents(user, intents);
				}

				// Run first process phase
				context.process();
				processedRooms.set(roomName, context);

				// Notify main service of completion
				await processorChannel.publish({ type: 'processedRoom', roomName });
			}

		} else if (message.type === 'flushRooms') {
			// Run second phase of processing. This must wait until *all* player code and first phase
			// processing has run
			await Promise.all(Fn.map(processedRooms, ([ roomName, context ]) => {
				if (context.receivedUpdate) {
					return shard.saveRoom(roomName, gameTime, context.room);
				} else {
					return shard.copyRoomFromPreviousTick(roomName, gameTime);
				}
			}));

			const rooms = [ ...Fn.map(processedRooms.entries(), ([ name, context ]) => ({
				name,
				sleepUntil: context.nextUpdate,
			})) ];
			await processorChannel.publish({ type: 'flushedRooms', rooms });
			processedRooms.clear();
		}
	}

} finally {
	shard.disconnect();
	processorChannel.disconnect();
}
