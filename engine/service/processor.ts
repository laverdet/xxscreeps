import assert from 'assert';
import * as Room from 'xxscreeps/engine/room';
import { mapInPlace } from 'xxscreeps/util/utility';
import { RoomProcessorContext } from 'xxscreeps/processor/room';
import { loadTerrain } from 'xxscreeps/game/map';
import * as Storage from 'xxscreeps/storage';
import { Channel } from 'xxscreeps/storage/channel';
import { Queue } from 'xxscreeps/storage/queue';
import { ProcessorMessage, ProcessorQueueElement } from '.';

// Keep track of rooms this thread ran. Global room processing must also happen here.
const processedRooms = new Map<string, RoomProcessorContext>();

// Connect to main & storage
const storage = await Storage.connect('shard0');
const { persistence } = storage;
const roomsQueue = Queue.connect<ProcessorQueueElement>(storage, 'processRooms', true);
const processorChannel = await new Channel<ProcessorMessage>(storage, 'processor').subscribe();

// Initialize world terrain
await loadTerrain(persistence);

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
				const [ room, intents ] = await Promise.all([
					(async() =>
						Room.read(await persistence.get(`room/${roomName}`))
					)(),
					Promise.all(mapInPlace(users, async user => {
						const intentsBlob = await persistence.get(`intents/${roomName}/${user}`);
						assert.strictEqual(intentsBlob.byteOffset, 0);
						const uint16 = new Uint16Array(intentsBlob.buffer);
						const intents = JSON.parse(String.fromCharCode(...uint16));
						return { user, intents };
					})),
				]);

				// Delete intent blobs in background
				const deleteIntentBlobs = Promise.all(mapInPlace(users, user =>
					persistence.del(`intents/${roomName}/${user}`)));

				// Create processor context and run first phase
				const context = new RoomProcessorContext(room, gameTime, intents);
				context.process();
				processedRooms.set(roomName, context);

				// Save and notify main service of completion
				await deleteIntentBlobs;
				await processorChannel.publish({ type: 'processedRoom', roomName });
			}

		} else if (message.type === 'flushRooms') {
			// Run second phase of processing. This must wait until *all* player code and first phase
			// processing has run
			await Promise.all(mapInPlace(processedRooms, ([ roomName, context ]) =>
				persistence.set(`room/${roomName}`, Room.write(context.room)),
			));
			await processorChannel.publish({ type: 'flushedRooms', roomNames: [ ...processedRooms.keys() ] });
			processedRooms.clear();
		}
	}

} finally {
	storage.disconnect();
	processorChannel.disconnect();
}
