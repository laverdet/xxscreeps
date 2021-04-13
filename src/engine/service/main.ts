import config from 'xxscreeps/config';
import * as Fn from 'xxscreeps/utility/functional';
import * as GameSchema from 'xxscreeps/engine/metadata/game';
import { AveragingTimer } from 'xxscreeps/utility/averaging-timer';
import { Deferred } from 'xxscreeps/utility/deferred';
import { getOrSet } from 'xxscreeps/utility/utility';
import { Shard } from 'xxscreeps/engine/model/shard';
import { Channel } from 'xxscreeps/storage/channel';
import { Mutex } from 'xxscreeps/storage/mutex';
import { Queue } from 'xxscreeps/storage/queue';
import type { GameMessage, ProcessorMessage, ProcessorQueueElement, RunnerMessage, ServiceMessage } from '.';

// Open channels
const shard = await Shard.connect('shard0');
const { storage } = shard;
const [
	roomsQueue, usersQueue, processorChannel, runnerChannel, serviceChannel, gameMutex,
] = await Promise.all([
	Queue.connect<ProcessorQueueElement>(storage, 'processRooms', true),
	Queue.connect(storage, 'runnerUsers'),
	new Channel<ProcessorMessage>(storage, 'processor').subscribe(),
	new Channel<RunnerMessage>(storage, 'runner').subscribe(),
	new Channel<ServiceMessage>(storage, 'service').subscribe(),
	Mutex.connect(storage, 'game'),
]);
await serviceChannel.publish({ type: 'mainConnected' });

// Run main game processing loop
let gameMetadata: GameSchema.Type | undefined;
let activeUsers: string[] = [];
let activeRooms: Set<string>;
let roomsSleptLastTick: string[] = [];
const sleepingRooms = new Map<number, string[]>();
const performanceTimer = new AveragingTimer(1000);

// Ctrl+C handler
let delayShutdown: Deferred<boolean> | undefined;
let shuttingDown = false;

// Listen for service updates
serviceChannel.listen(message => {
	if (message.type === 'gameModified') {
		gameMetadata = undefined;
	} else if (message.type === 'shutdown') {
		shuttingDown = true;
		delayShutdown?.resolve(false);
	}
});

try {
	do {
		await gameMutex.scope(async() => {
			// Start timer
			performanceTimer.start();
			const timeStartedLoop = Date.now();

			// Refresh current game status
			if (gameMetadata) {
				const roomsWakingUp = sleepingRooms.get(gameMetadata.time);
				if (roomsWakingUp) {
					sleepingRooms.delete(gameMetadata.time);
					Fn.forEach(roomsWakingUp, room => activeRooms.add(room));
				}
			} else {
				gameMetadata = GameSchema.read(await storage.blob.get('game'));
				activeRooms = new Set(gameMetadata.rooms);
				activeUsers = [ ...gameMetadata.users ];
				sleepingRooms.clear();
			}
			const gameTime = gameMetadata.time + 1;

			// Deactivate idle rooms
			if (roomsSleptLastTick.length) {
				await Promise.all(roomsSleptLastTick.map(name => {
					activeRooms.delete(name);
					return shard.copyRoomFromPreviousTick(name, gameTime);
				}));
				roomsSleptLastTick = [];
			}

			// Add users to runner queue
			usersQueue.version(`${gameTime}`);
			await Promise.all([ usersQueue.clear(), usersQueue.push(activeUsers) ]);
			await runnerChannel.publish({ type: 'processUsers', time: gameTime });

			// Wait for runners to finish
			const processedUsers = new Set<string>();
			const intentsByRoom = new Map<string, Set<string>>();
			for await (const message of runnerChannel) {
				if (message.type === 'runnerConnected') {
					await runnerChannel.publish({ type: 'processUsers', time: gameTime });

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
			roomsQueue.version(`${gameTime}`);
			const roomsQueueElements = [ ...Fn.map(activeRooms, room => ({
				room,
				users: [ ...intentsByRoom.get(room) ?? [] ],
			})) ];
			await Promise.all([ roomsQueue.clear(), roomsQueue.push(roomsQueueElements) ]);
			await processorChannel.publish({ type: 'processRooms', time: gameTime });

			// Handle incoming processor messages
			const processedRooms = new Set<string>();
			const flushedRooms = new Set<string>();
			for await (const message of processorChannel) {
				if (message.type === 'processorConnected') {
					await processorChannel.publish({ type: 'processRooms', time: gameTime });

				} else if (message.type === 'processedRoom') {
					processedRooms.add(message.roomName);
					if (activeRooms.size === processedRooms.size) {
						await processorChannel.publish({ type: 'flushRooms' });
					}

				} else if (message.type === 'flushedRooms') {
					message.rooms.forEach(info => {
						flushedRooms.add(info.name);
						if (info.sleepUntil !== gameTime + 1) {
							if ((info.sleepUntil ?? Infinity) !== Infinity) {
								getOrSet(sleepingRooms, info.sleepUntil, () => []).push(info.name);
							}
							roomsSleptLastTick.push(info.name);
						}
					});

					if (activeRooms.size === flushedRooms.size) {
						break;
					}
				}
			}

			// Update game state
			++gameMetadata.time;
			await storage.blob.set('game', GameSchema.write(gameMetadata));

			// Finish up
			const now = Date.now();
			const timeTaken = now - timeStartedLoop;
			const averageTime = Math.floor(performanceTimer.stop() / 10000) / 100;
			console.log(`Tick ${gameTime} ran in ${timeTaken}ms; avg: ${averageTime}ms`);
			await new Channel<GameMessage>(storage, 'main').publish({ type: 'tick', time: gameTime });
		});

		// Shutdown request came in during game loop
		// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
		if (shuttingDown) {
			break;
		}

		// Add delay
		const delay = config.game?.tickSpeed ?? 250 - Date.now();
		delayShutdown = new Deferred;
		const { promise } = delayShutdown;
		setTimeout(() => delayShutdown!.resolve(true), delay).unref();
		if (!await promise) {
			break;
		}
	} while (true);

	// Save on graceful exit
	await storage.blob.save();

} finally {
	// Clean up
	shard.disconnect();
	processorChannel.disconnect();
	runnerChannel.disconnect();
	await gameMutex.disconnect();
	await serviceChannel.publish({ type: 'mainDisconnected' });
	serviceChannel.disconnect();
}
