import * as Path from 'path';
import * as DatabaseSchema from '~/engine/metabase';
import { BufferView, getReader } from '~/engine/schema';
import * as Iterables from '~/lib/iterable';
import { topLevelTask } from '~/lib/task';
import { Worker } from '~/lib/worker-threads';
import { BlobStorage } from '~/storage/blob';
import { Channel } from '~/storage/channel';
import { Queue } from '~/storage/queue';
import { ProcessorMessage } from '.';

topLevelTask(async() => {
	// Open channels and connect to storage
	const blobStorage = await BlobStorage.create();
	const roomsQueue = await Queue.create('processRooms');
	const processorChannel = await Channel.connect<ProcessorMessage>('processor');

	// Load current game state
	const gameReader = getReader(DatabaseSchema.schema.Game, DatabaseSchema.interceptorSchema);
	const gameMetadata = gameReader(BufferView.fromTypedArray(await blobStorage.load('game')), 0);

	// Start worker threads
	const processorWorkers = Array(4).fill(null).map(() => new Worker(Path.join(__dirname, 'processor.ts')));

	let gameTime = 1;
	const processedRooms = new Set<string>();
	const flushedRooms = new Set<string>();
	try {

		do {
			// Add rooms to queue and notify processors
			roomsQueue.version(gameTime);
			await roomsQueue.push([ ...gameMetadata.activeRooms.values() ]);
			processorChannel.publish({ type: 'processRooms', time: gameTime });

			// Handle processor messages
			for await (const message of processorChannel) {
				if (message.type === 'processorConnected') {
					processorChannel.publish({ type: 'processRooms', time: gameTime });

				} else if (message.type === 'processedRoom') {
					processedRooms.add(message.roomName);
					if (gameMetadata.activeRooms.size === processedRooms.size) {
						processorChannel.publish({ type: 'flushRooms' });
					}

				} else if (message.type === 'flushedRooms') {
					message.roomNames.forEach(roomName => flushedRooms.add(roomName));
					if (gameMetadata.activeRooms.size === flushedRooms.size) {
						break;
					}
				}
			}

			// Delete old tick data
			// eslint-disable-next-line no-loop-func
			await Promise.all(Iterables.map(gameMetadata.activeRooms, (roomName: string) =>
				blobStorage.delete(`ticks/${gameTime}/${roomName}`)));

			// Set up for next tick
			processedRooms.clear();
			flushedRooms.clear();
			console.log(gameTime);
			++gameTime;
		// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
		} while (true);

	} finally {
		blobStorage.disconnect();
		roomsQueue.disconnect();
		processorChannel.disconnect();
		for (const processor of processorWorkers) {
			await processor.terminate();
		}
	}
});
