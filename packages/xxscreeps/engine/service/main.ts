import type { Effect } from 'xxscreeps/utility/types.js';
import config from 'xxscreeps/config/index.js';
import { Database, Shard } from 'xxscreeps/engine/db/index.js';
import { Mutex } from 'xxscreeps/engine/db/mutex.js';
import { abandonIntentsForTick, activeRoomsKey, begetRoomProcessQueue, getProcessorChannel, processorTimeKey } from 'xxscreeps/engine/processor/model.js';
import { getRunnerChannel, runnerUsersSetKey } from 'xxscreeps/engine/runner/model.js';
import { Deferred, mustNotReject } from 'xxscreeps/utility/async.js';
import * as Async from 'xxscreeps/utility/async.js';
import { AveragingTimer } from 'xxscreeps/utility/averaging-timer.js';
import { acquireTimeout } from 'xxscreeps/utility/utility.js';
import { tickSpeed, watch } from './tick.js';
import { checkIsEntry, getServiceChannel } from './index.js';

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
const stop = () => {
	halted = true;
	halt?.();
	tickDelay?.resolve(false);
};
const shutdownEffect = serviceChannel.listen(message => {
	// We publish our own shutdown during clean exit; re-entering stop() is a
	// no-op today but guarding here avoids surprises if stop() grows side effects.
	if (message.type === 'shutdown' && !halted) {
		stop();
	}
});

// Configure .screepsrc.yaml watcher to update tick speed immediately
const unwatch = await watch(() => {
	console.log(`Tick speed changed to ${tickSpeed}ms`);
	tickDelay?.resolve(true);
});

// Run main game processing loop
const performanceTimer = new AveragingTimer(100);
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
	const processorMessages = serviceChannel.iterable();
	await serviceChannel.publish({ type: 'mainConnected' });
	for await (const message of Async.breakable(processorMessages, breaker => halt = breaker)) {
		if (message.type === 'shutdown') {
			halted = true;
			break;
		} else if (
			message.type === 'processorInitialized' &&
			await shard.scratch.zcard(activeRoomsKey) === rooms.length
		) {
			break;
		}
	}
	if (!halted) {
		await begetRoomProcessQueue(shard, shard.time + 1, shard.time);
	}

	// Game loop
	while (!halted) {
		let timeStartedLoop!: number;
		let tickCompleted = false;
		await gameMutex.scope(async () => {
			// Shutdown can land while we're blocked acquiring the mutex (CLI
			// `importWorld` wipes scratch under a pause, then exits). Running a
			// tick body against wiped state corrupts shard.time and stalls on the
			// abandon timeout — bail now.
			if (halted) return;
			timeStartedLoop = Date.now();
			performanceTimer.start();

			// Initialize
			const time = shard.time + 1;
			const serviceMessages = serviceChannel.iterable();
			await Promise.all([
				shard.scratch.copy('activeUsers', runnerUsersSetKey(time)),
				processorChannel.publish({ type: 'process', time }),
			]);
			await runnerChannel.publish({ type: 'run', time });
			// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
			if (halted) return;

			// `breakable` so a mid-tick shutdown interrupts the wait instead of
			// burning the full intentAbandonTimeout.
			{
				// eslint-disable-next-line @typescript-eslint/no-unused-vars
				using timeout = acquireTimeout(
					config.processor.intentAbandonTimeout,
					() => mustNotReject(async () => {
						const rooms = await abandonIntentsForTick(shard, time);
						console.log(`Abandoning intents in rooms [${rooms.join(', ')}] for tick ${time}`);
					}));
				for await (const message of Async.breakable(serviceMessages, breaker => halt = breaker)) {
					if (message.type === 'processorInitialized') {
						await processorChannel.publish({ type: 'process', time });
					} else if (message.type === 'runnerConnected') {
						await runnerChannel.publish({ type: 'run', time });
					} else if (message.type === 'tickFinished') {
						tickCompleted = true;
						break;
					}
				}
			}

			// Shutdown (not tickFinished) broke the loop — skip the state update
			// so shard.time doesn't advance past unrun work.
			if (!tickCompleted) return;

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
		tickDelay = new Deferred();
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
	shutdownEffect();
	stop();
	unwatch?.();
	await gameMutex.disconnect();
	await serviceChannel.publish({ type: 'mainDisconnected' });
	serviceChannel.disconnect();
	shard.disconnect();
	db.disconnect();
}
