import configPromise from '~/engine/config';
import { readGame, writeGame } from '~/engine/metadata/game';
import { AveragingTimer } from '~/lib/averaging-timer';
import { getOrSet, mapInPlace } from '~/lib/utility';
import { BlobStorage } from '~/storage/blob';
import { Channel } from '~/storage/channel';
import { Mutex } from '~/storage/mutex';
import { Queue } from '~/storage/queue';
import type { GameMessage, ProcessorMessage, ProcessorQueueElement, RunnerMessage, ServiceMessage } from '.';

export default async function() {
	// Open channels
	const { config } = await configPromise;
	const [
		blobStorage, roomsQueue, usersQueue, processorChannel, runnerChannel, serviceChannel, gameMutex,
	] = await Promise.all([
		BlobStorage.connect(),
		Queue.create<ProcessorQueueElement>('processRooms'),
		Queue.create('runnerUsers'),
		Channel.connect<ProcessorMessage>('processor'),
		Channel.connect<RunnerMessage>('runner'),
		Channel.connect<ServiceMessage>('service'),
		Mutex.create('game'),
	]);
	serviceChannel.publish({ type: 'mainConnected' });

	// Load current game state
	const gameMetadata = readGame(await blobStorage.load('game'));
	const flushGame = async() => {
		await blobStorage.save('game', writeGame(gameMetadata));
	};

	// Run main game processing loop
	const performanceTimer = new AveragingTimer(1000);
	const activeUsers = [ ...gameMetadata.users ];

	// Ctrl+C handler
	let terminated = false;
	serviceChannel.listen(message => {
		if (message.type === 'shutdown') {
			terminated = true;
		}
	});
	const didTerminate = () => terminated;

	try {
		do {
			await gameMutex.scope(async() => {
				performanceTimer.start();
				const timeStartedLoop = Date.now();

				// Add users to runner queue
				usersQueue.version(gameMetadata.time);
				await usersQueue.push(activeUsers);
				runnerChannel.publish({ type: 'processUsers', time: gameMetadata.time });

				// Wait for runners to finish
				const processedUsers = new Set<string>();
				const intentsByRoom = new Map<string, Set<string>>();
				for await (const message of runnerChannel) {
					if (message.type === 'runnerConnected') {
						runnerChannel.publish({ type: 'processUsers', time: gameMetadata.time });

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
				roomsQueue.version(gameMetadata.time);
				await roomsQueue.push([ ...mapInPlace(gameMetadata.activeRooms, room => ({
					room,
					users: [ ...intentsByRoom.get(room) ?? [] ],
				})) ]);
				processorChannel.publish({ type: 'processRooms', time: gameMetadata.time });

				// Handle incoming processor messages
				const processedRooms = new Set<string>();
				const flushedRooms = new Set<string>();
				for await (const message of processorChannel) {
					if (message.type === 'processorConnected') {
						processorChannel.publish({ type: 'processRooms', time: gameMetadata.time });

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
					blobStorage.delete(`ticks/${gameMetadata.time}/${roomName}`)));

				// Set up for next tick
				const now = Date.now();
				const timeTaken = now - timeStartedLoop;
				const averageTime = Math.floor(performanceTimer.stop() / 10000) / 100;
				console.log(`Tick ${gameMetadata.time} ran in ${timeTaken}ms; avg: ${averageTime}ms`);
				++gameMetadata.time;
				Channel.publish<GameMessage>('main', { type: 'tick', time: gameMetadata.time });
			});

			// Add delay
			if (didTerminate()) {
				break;
			}
			const delay = config.game?.tickSpeed ?? 250 - Date.now();
			if (delay > 0) {
				await new Promise(resolve => setTimeout(resolve, delay));
			}
			if (didTerminate()) {
				break;
			}
		} while (true);

	} finally {
		// Clean up
		await flushGame();
		blobStorage.disconnect();
		roomsQueue.disconnect();
		usersQueue.disconnect();
		processorChannel.disconnect();
		runnerChannel.disconnect();
		serviceChannel.disconnect();
		gameMutex.disconnect();
	}
}
