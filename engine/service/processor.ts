import assert from 'assert';
import * as Room from '~/engine/schema/room';
import { mapInPlace } from '~/lib/utility';
import { ProcessorContext } from '~/engine/processor/context';
import { bindAllProcessorIntents } from '~/engine/processor/intents';
import { runWithState } from '~/game/game';
import { loadTerrain } from '~/game/map';
import * as Storage from '~/storage';
import { Channel } from '~/storage/channel';
import { Queue } from '~/storage/queue';
import { ProcessorMessage, ProcessorQueueElement } from '.';

export default async function() {
	// Bind all the processor intent methods to game objec prototpyes.
	// For example Creep.prototype[Process] = () => ...
	bindAllProcessorIntents();

	// Keep track of rooms this thread ran. Global room processing must also happen here.
	const processedRooms = new Map<string, ProcessorContext>();

	// Connect to main & storage
	const persistence = await Storage.connect('shard0');
	const roomsQueue = await Queue.connect<ProcessorQueueElement>('processRooms');
	const processorChannel = await Channel.connect<ProcessorMessage>('processor');

	// Initialize world terrain
	await loadTerrain(persistence);

	// Start the processing loop
	let gameTime = -1;
	processorChannel.publish({ type: 'processorConnected' });
	try {
		for await (const message of processorChannel) {

			if (message.type === 'shutdown') {
				break;

			} else if (message.type === 'processRooms') {
				// First processing phase. Can start as soon as all players with visibility into this room
				// have run their code
				gameTime = message.time;
				roomsQueue.version(gameTime);
				for await (const { room, users } of roomsQueue) {
					// Read room data and intents from storage
					const [ roomBlob, intents ] = await Promise.all([
						persistence.get(`room/${room}`),
						Promise.all(mapInPlace(users, async user => ({
							user,
							intents: await persistence.get(`intents/${room}/${user}`),
						}))),
					]);
					const deleteIntentBlobs = Promise.all(mapInPlace(intents, ({ user }) =>
						persistence.del(`intents/${room}/${user}`)));
					// Process the room
					const roomInstance = Room.read(roomBlob);
					const context = new ProcessorContext(gameTime, roomInstance);
					runWithState([ roomInstance ], () => {
						for (const intentInfo of intents) {
							assert.equal(intentInfo.intents.byteOffset, 0);
							const uint16 = new Uint16Array(intentInfo.intents.buffer);
							const intents = JSON.parse(String.fromCharCode(...uint16));
							context.processIntents(intentInfo.user, intents);
						}
						context.processTick();
					});
					// Save and notify main service of completion
					await deleteIntentBlobs;
					processedRooms.set(room, context);
					processorChannel.publish({ type: 'processedRoom', roomName: room });
				}

			} else if (message.type === 'flushRooms') {
				// Run second phase of processing. This must wait until *all* player code and first phase
				// processing has run
				await Promise.all(mapInPlace(processedRooms, ([ roomName, context ]) =>
					persistence.set(`room/${roomName}`, Room.write(context.room)),
				));
				processorChannel.publish({ type: 'flushedRooms', roomNames: [ ...processedRooms.keys() ] });
				processedRooms.clear();
			}
		}

	} finally {
		persistence.disconnect();
		processorChannel.disconnect();
		roomsQueue.disconnect();
	}
}
