import configPromise from '~/engine/config';
import * as GameSchema from '~/engine/metadata/game';
import { AveragingTimer } from '~/lib/averaging-timer';
import { getOrSet, makeResolver, mapInPlace } from '~/lib/utility';
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

	// Run main game processing loop
	let gameMetadata: GameSchema.Type | undefined;
	let activeRooms: string[] = [];
	let activeUsers: string[] = [];
	const performanceTimer = new AveragingTimer(1000);

	// Ctrl+C handler
	let delayResolve: Resolver<boolean> | undefined;
	let shuttingDown = false;

	// Listen for service updates
	serviceChannel.listen(message => {
		if (message.type === 'gameModified') {
			gameMetadata = undefined;
		} else if (message.type === 'shutdown') {
			shuttingDown = true;
			delayResolve?.resolve?.(false);
		}
	});

	try {
		do {
			await gameMutex.scope(async() => {
				// Start timer
				performanceTimer.start();
				const timeStartedLoop = Date.now();

				// Refresh current game status
				if (!gameMetadata) {
					gameMetadata = GameSchema.read(await blobStorage.load('game'));
					activeRooms = [ ...gameMetadata.activeRooms ];
					activeUsers = [ ...gameMetadata.users ];
				}

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
				await roomsQueue.push([ ...mapInPlace(activeRooms, room => ({
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
						if (activeRooms.length === processedRooms.size) {
							processorChannel.publish({ type: 'flushRooms' });
						}

					} else if (message.type === 'flushedRooms') {
						message.roomNames.forEach(roomName => flushedRooms.add(roomName));
						if (activeRooms.length === flushedRooms.size) {
							break;
						}
					}
				}

				// Update game state
				const previousTime = gameMetadata.time++;
				await Promise.all([
					...mapInPlace(gameMetadata.activeRooms, (roomName: string) =>
						blobStorage.delete(`ticks/${previousTime}/${roomName}`)),
					blobStorage.save('game', GameSchema.write(gameMetadata)),
				]);

				// Finish up
				const now = Date.now();
				const timeTaken = now - timeStartedLoop;
				const averageTime = Math.floor(performanceTimer.stop() / 10000) / 100;
				console.log(`Tick ${previousTime} ran in ${timeTaken}ms; avg: ${averageTime}ms`);
				Channel.publish<GameMessage>('main', { type: 'tick', time: gameMetadata.time });
			});

			// Shutdown request came in during game loop
			// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
			if (shuttingDown) {
				break;
			}

			// Add delay
			const delay = config.game?.tickSpeed ?? 250 - Date.now();
			let delayPromise: Promise<boolean>;
			[ delayPromise, delayResolve ] = makeResolver();
			setTimeout(() => delayResolve!.resolve(true), delay).unref();
			if (!await delayPromise) {
				break;
			}
		} while (true);

	} finally {
		// Clean up
		blobStorage.disconnect();
		roomsQueue.disconnect();
		usersQueue.disconnect();
		processorChannel.disconnect();
		runnerChannel.disconnect();
		gameMutex.disconnect();
		serviceChannel.publish({ type: 'mainDisconnected' });
		serviceChannel.disconnect();
	}
}
