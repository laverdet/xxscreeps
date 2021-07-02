import type { Effect } from 'xxscreeps/utility/types';
import config from 'xxscreeps/config';
import * as Async from 'xxscreeps/utility/async';
import { AveragingTimer } from 'xxscreeps/utility/averaging-timer';
import { Database, Shard } from 'xxscreeps/engine/db';
import { Deferred, mustNotReject } from 'xxscreeps/utility/async';
import { Mutex } from 'xxscreeps/engine/db/mutex';
import { abandonIntentsForTick, activeRoomsKey, getProcessorChannel, processorTimeKey } from 'xxscreeps/engine/processor/model';
import { getRunnerChannel, runnerUsersSetKey } from 'xxscreeps/engine/runner/model';
import { checkIsEntry, getServiceChannel, handleInterrupt } from '.';
import { tickSpeed, watch } from './tick';
checkIsEntry();

// Open channels
const db = await Database.connect();
const shard = await Shard.connect(db, 'shard0');
const processorChannel = getProcessorChannel(shard);
const runnerChannel = getRunnerChannel(shard);
const [ gameMutex, serviceChannel ] = await Promise.all([
	Mutex.connect('game', shard.data, shard.pubsub),
	getServiceChannel(shard).subscribe(),
]);

// Interrupt handler
let halted = false as boolean;
let halt: Effect | undefined;
let tickDelay: Deferred<boolean> | undefined;
handleInterrupt(() => {
	console.log('Shutting down...');
	halted = true;
	halt?.();
	tickDelay?.resolve(false);
	unwatch?.();
});

// Configure .screepsrc.yaml watcher to update tick speed immediately
const unwatch = await watch(() => {
	console.log(`Tick speed changed to ${tickSpeed}ms`);
	tickDelay?.resolve(true);
});

// Run main game processing loop
const performanceTimer = new AveragingTimer(1000);
const saveInterval = config.database.saveInterval * 60000;
let lastSave = Date.now();
try {
	// Initialize scratch state
	const [ rooms ] = await Promise.all([
		shard.data.smembers('rooms'),
		shard.scratch.flushdb(),
	]);
	await Promise.all([
		shard.scratch.sadd('initializeRooms', rooms),
		shard.scratch.set(processorTimeKey, shard.time),
	]);

	// Wait for processors to connect and initialize world state
	await serviceChannel.publish({ type: 'mainConnected' });
	for await (const message of Async.breakable(serviceChannel, breaker => halt = breaker)) {
		if (
			message.type === 'processorInitialized' &&
			await shard.scratch.zcard(activeRoomsKey) === rooms.length
		) {
			break;
		}
	}

	// Game loop
	// eslint-disable-next-line no-unmodified-loop-condition
	while (!halted) {
		const timeStartedLoop = Date.now();
		performanceTimer.start();
		await gameMutex.scope(async() => {
			// Initialize
			const time = shard.time + 1;
			await Promise.all([
				shard.scratch.copy('activeUsers', runnerUsersSetKey(time)),
				processorChannel.publish({ type: 'process', time }),
			]);
			await runnerChannel.publish({ type: 'run', time });

			// Wait for tick to finish
			const timeout = setTimeout(() => mustNotReject(async() => {
				const rooms = await abandonIntentsForTick(shard, time);
				console.log(`Abandoning intents in rooms [${rooms.join(', ')}] for tick ${time}`);
			}), config.processor.intentAbandonTimeout);
			for await (const message of serviceChannel) {
				if (message.type === 'processorInitialized') {
					await processorChannel.publish({ type: 'process', time });
				} else if (message.type === 'runnerConnected') {
					await runnerChannel.publish({ type: 'run', time });
				} else if (message.type === 'tickFinished') {
					break;
				}
			}
			clearTimeout(timeout);

			// Update game state
			await shard.data.set('time', time);

			// Display statistics
			const now = Date.now();
			const timeTaken = now - timeStartedLoop;
			const averageTime = Math.floor(performanceTimer.stop() / 10000) / 100;
			await shard.channel.publish({ type: 'tick', time });
			shard.time = time;
			console.log(`Tick ${time} ran in ${timeTaken}ms; avg: ${averageTime}ms`);
		});

		// Shutdown request came in during game loop
		// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
		if (halted) {
			break;
		}

		// Maybe save
		const now = Date.now();
		if (lastSave + saveInterval < now) {
			lastSave = now;
			mustNotReject(Promise.all([
				db.save(),
				shard.save(),
			]));
		}

		// Add delay
		const delay = Math.max(0, tickSpeed - (Date.now() - timeStartedLoop));
		tickDelay = new Deferred;
		const { promise, resolve } = tickDelay;
		setTimeout(() => resolve(true), delay).unref();
		if (!await promise) {
			break;
		}
	}

	await Promise.all([
		// Forward shutdown message to all services
		getProcessorChannel(shard).publish({ type: 'shutdown' }),
		getRunnerChannel(shard).publish({ type: 'shutdown' }),
		serviceChannel.publish({ type: 'shutdown' }),
		// Save on graceful shutdown
		db.save(),
		shard.save(),
	]);

} finally {
	// Clean up
	await gameMutex.disconnect();
	await serviceChannel.publish({ type: 'mainDisconnected' });
	serviceChannel.disconnect();
	shard.disconnect();
	db.disconnect();
}
