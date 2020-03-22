import * as Schema from '~/engine/game/schema';
import { getReader, getWriter } from '~/engine/schema';
import { BufferView } from '~/engine/schema/buffer-view';
import { topLevelTask } from '~/lib/task';
import { mapInPlace } from '~/lib/utility';
import { ProcessorContext } from '~/engine/processor/context';
import { bindAllProcessorIntents } from '~/engine/processor/intents';
import { Game } from '~/engine/game/game';
import { BlobStorage } from '~/storage/blob';
import { Channel } from '~/storage/channel';
import { Queue } from '~/storage/queue';
import { ProcessorMessage } from '.';

topLevelTask(async() => {
	// Bind all the processor intent methods to game objec prototpyes.
	// For example Creep.prototype[Process] = () => ...
	bindAllProcessorIntents();
	Schema.finalizePrototypeGetters();

	// Initialize binary room schema
	const readRoom = getReader(Schema.schema.Room, Schema.interceptorSchema);
	const writeRoom = getWriter(Schema.schema.Room, Schema.interceptorSchema);
	const writeBuffer = new BufferView(new ArrayBuffer(1024 * 1024));

	// Keep track of rooms this thread ran. Global room processing must also happen here.
	const processedRooms = new Map<string, ProcessorContext>();

	// Connect to main & storage
	const blobStorage = await BlobStorage.connect();
	const roomsQueue = await Queue.connect('processRooms');
	const processorChannel = await Channel.connect<ProcessorMessage>('processor');

	// Start the processing loop
	let gameTime = -1;
	processorChannel.publish({ type: 'processorConnected' });
	try {
		for await (const message of processorChannel) {

			if (message.type === 'processRooms') {
				// First processing phase. Can start as soon as all players with visibility into this room
				// have run their code
				gameTime = message.time;
				roomsQueue.version(gameTime);
				for await (const roomName of roomsQueue) {
					// Read room from storage
					const roomBlob = await blobStorage.load(`ticks/${gameTime}/${roomName}`);
					const room = readRoom(BufferView.fromTypedArray(roomBlob), 0);
					// Process
					(global as any).Game = new Game(gameTime, [ room ]);
					const context = new ProcessorContext(gameTime, room);
					context.process();
					// Save and notify main service of completion
					processedRooms.set(roomName, context);
					processorChannel.publish({ type: 'processedRoom', roomName });
				}

			} else if (message.type === 'flushRooms') {
				// Run second phase of processing. This must wait until *all* player code and first phase
				// processing has run
				const nextGameTime = gameTime + 1;
				await Promise.all(mapInPlace(processedRooms, ([ roomName, context ]) => {
					const length = writeRoom(context.room, writeBuffer, 0);
					return blobStorage.save(
						`ticks/${nextGameTime}/${roomName}`,
						new Uint8Array(writeBuffer.uint8.buffer, 0, length));
				}));
				processorChannel.publish({ type: 'flushedRooms', roomNames: [ ...processedRooms.keys() ] });
				processedRooms.clear();
			}
		}

	} finally {
		blobStorage.disconnect();
		processorChannel.disconnect();
		roomsQueue.disconnect();
	}
});
