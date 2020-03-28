import configPromise from '~/engine/config';
import * as DatabaseSchema from '~/engine/metabase';
import { getReader } from '~/lib/schema';
import { AveragingTimer } from '~/lib/averaging-timer';
import { getOrSet, filterInPlace, mapInPlace } from '~/lib/utility';
import { BlobStorage } from '~/storage/blob';
import { Channel } from '~/storage/channel';
import { Queue } from '~/storage/queue';
import { RunnerMessage, ProcessorMessage, ProcessorQueueElement, MainMessage } from '.';

export default async function() {
	// Open channels and connect to storage
	const { config } = await configPromise;
	const blobStorage = await BlobStorage.create();
	const roomsQueue = await Queue.create<ProcessorQueueElement>('processRooms');
	const usersQueue = await Queue.create('runnerUsers');
	const processorChannel = await Channel.connect<ProcessorMessage>('processor');
	const runnerChannel = await Channel.connect<RunnerMessage>('runner');
	Channel.publish<MainMessage>('main', { type: 'mainConnected' });

	// Load current game state
	const gameReader = getReader(DatabaseSchema.schema.Game, DatabaseSchema.interceptorSchema);
	const gameMetadata = gameReader(await blobStorage.load('game'));

	// Run main game processing loop
	let gameTime = 1;
	const performanceTimer = new AveragingTimer(1000);
	const activeUsers = [ ...mapInPlace(filterInPlace(gameMetadata.users.values(), user => {
		if (user.id === '2' || user.id === '3') {
			return false;
		}
		return user.active;
	}), user => user.id) ];
	try {

		do {
			performanceTimer.start();
			const timeStartedLoop = Date.now();

			// Add users to runner queue
			usersQueue.version(gameTime);
			await usersQueue.push(activeUsers);
			runnerChannel.publish({ type: 'processUsers', time: gameTime });

			// Wait for runners to finish
			const processedUsers = new Set<string>();
			const intentsByRoom = new Map<string, Set<string>>();
			for await (const message of runnerChannel) {
				if (message.type === 'runnerConnected') {
					runnerChannel.publish({ type: 'processUsers', time: gameTime });

				} else if (message.type === 'processedUser') {
					processedUsers.add(message.userId);
					for (const roomName of message.roomNames) {
						getOrSet(intentsByRoom, roomName, () => new Set).add(message.userId);
					}
					if (activeUsers.length === processedUsers.size) {
						break;
					}
				}
			}

			// Add rooms to queue and notify processors
			roomsQueue.version(gameTime);
			await roomsQueue.push([ ...mapInPlace(gameMetadata.activeRooms, room => ({
				room,
				users: [ ...intentsByRoom.get(room) ?? [] ],
			})) ]);
			processorChannel.publish({ type: 'processRooms', time: gameTime });

			// Handle incoming processor messages
			const processedRooms = new Set<string>();
			const flushedRooms = new Set<string>();
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
			const timeTaken = Date.now() - timeStartedLoop;
			const averageTime = Math.floor(performanceTimer.stop() / 10000) / 100;
			console.log(`Tick ${gameTime} ran in ${timeTaken}ms; avg: ${averageTime}ms`);
			++gameTime;
			Channel.publish<MainMessage>('main', { type: 'tick', time: gameTime });
			const delay = config.game.tickSpeed ?? 250 - timeTaken;
			if (delay > 0) {
				await new Promise(resolve => setTimeout(resolve, delay));
			}
		} while (true);

	} finally {
		blobStorage.disconnect();
		roomsQueue.disconnect();
		processorChannel.disconnect();
	}
}
