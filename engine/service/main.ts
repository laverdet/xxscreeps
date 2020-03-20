import * as Path from 'path';
import * as DatabaseSchema from '~/engine/metabase';
import { BufferView, getReader } from '~/engine/schema';
import { topLevelTask } from '~/lib/task';
import { mapInPlace } from '~/lib/utility';
import { Worker } from '~/lib/worker-threads';
import { BlobStorage } from '~/storage/blob';
import { Channel } from '~/storage/channel';
import { Queue } from '~/storage/queue';
import { RunnerMessage, ProcessorMessage } from '.';

topLevelTask(async() => {
	// Open channels and connect to storage
	const blobStorage = await BlobStorage.create();
	const roomsQueue = await Queue.create('processRooms');
	const usersQueue = await Queue.create('runnerUsers');
	const processorChannel = await Channel.connect<ProcessorMessage>('processor');
	const runnerChannel = await Channel.connect<RunnerMessage>('runner');

	// Load current game state
	const gameReader = getReader(DatabaseSchema.schema.Game, DatabaseSchema.interceptorSchema);
	const gameMetadata = gameReader(BufferView.fromTypedArray(await blobStorage.load('game')), 0);

	// Start worker threads
	const processorWorkers = Array(1).fill(null).map(() => new Worker(Path.join(__dirname, 'processor.ts')));
	const runnerWorkers = Array(1).fill(null).map(() => new Worker(Path.join(__dirname, 'runner.ts')));

	// Run main game processing loop
	let gameTime = 1;
	const activeUsers = (gameMetadata.users as any[]).filter(user => {
		if (user.id === '2' || user.id === '3') {
			return false;
		}
		return user.active;
	}).map(user => user.id);
	const processedRooms = new Set<string>();
	const flushedRooms = new Set<string>();
	const processedUsers = new Set<string>();
	try {

		do {
			// Add users to runner queue
			usersQueue.version(gameTime);
			await usersQueue.push(activeUsers);
			runnerChannel.publish({ type: 'processUsers', time: gameTime });

			// Wait for runners to finish
			for await (const message of runnerChannel) {
				if (message.type === 'runnerConnected') {
					runnerChannel.publish({ type: 'processUsers', time: gameTime });

				} else if (message.type === 'processedUser') {
					processedUsers.add(message.id);
					if (gameMetadata.activeRooms.size === processedUsers.size) {
						break;
					}
				}
			}

			// Add rooms to queue and notify processors
			roomsQueue.version(gameTime);
			await roomsQueue.push([ ...gameMetadata.activeRooms.values() ]);
			processorChannel.publish({ type: 'processRooms', time: gameTime });

			// Handle incoming processor messages
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
			await Promise.all(mapInPlace(gameMetadata.activeRooms, (roomName: string) =>
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
		for (const runner of runnerWorkers) {
			await runner.terminate();
		}
	}
});
