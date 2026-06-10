import { config } from 'xxscreeps/config/index.js';
import { importMods } from 'xxscreeps/config/mods/index.js';
import { Database, Shard } from 'xxscreeps/engine/db/index.js';
import { Mutex } from 'xxscreeps/engine/db/mutex.js';
import { abandonIntentsForTick, activeRoomsKey, begetRoomProcessQueue, getProcessorChannel } from 'xxscreeps/engine/processor/model.js';
import { runShardTickProcessors } from 'xxscreeps/engine/processor/shard.js';
import { getRunnerChannel, runnerUsersSetKey } from 'xxscreeps/engine/runner/model.js';
import { Fn } from 'xxscreeps/functional/fn.js';
import { mustNotReject } from 'xxscreeps/utility/async.js';
import { AveragingTimer } from 'xxscreeps/utility/averaging-timer.js';
import { acquireTimeout } from 'xxscreeps/utility/utility.js';
import { tickSpeed, watch } from './tick.js';
import { checkIsEntry, getServiceChannel } from './index.js';

checkIsEntry();

await importMods('main');

using db = await Database.connect();
using shard = await Shard.connect(db, config.shards[0]!.name);
await using disposable = new AsyncDisposableStack();

// Open channels
const processorChannel = getProcessorChannel(shard);
const runnerChannel = getRunnerChannel(shard);
const [ mainMutex, gameMutex, serviceChannel ] = await Promise.all([
	Mutex.connect('main', shard.data, shard.pubsub),
	Mutex.connect('game', shard.data, shard.pubsub),
	getServiceChannel(shard).subscribe(),
]);
disposable.defer(() => serviceChannel.disconnect());
disposable.defer(() => serviceChannel.publish({ type: 'mainDisconnected' }));
disposable.use(mainMutex);
disposable.use(gameMutex);

// Configure .screepsrc.yaml watcher to update tick speed immediately
let tickDelay: PromiseWithResolvers<boolean>['resolve'] | undefined;
await watch(() => {
	console.log(`Tick speed changed to ${tickSpeed}ms`);
	tickDelay?.(true);
});

// Bookkeeping
const performanceTimer = new AveragingTimer(100);
const saveInterval = config.database.saveInterval * 60000;

// Initialize scratch state
await using _main = await mainMutex.acquire();
const [ rooms ] = await Promise.all([
	shard.data.sMembers('rooms'),
	shard.scratch.flushdb(),
]);
await shard.scratch.sAdd('initializeRooms', rooms);

// Wait for processors to connect and initialize world state
await using serviceMessages = Fn.unbreak(serviceChannel.iterable());
await serviceChannel.publish({ type: 'mainConnected' });
const didInitialize = await async function() {
	for await (const message of serviceMessages) {
		// eslint-disable-next-line @typescript-eslint/switch-exhaustiveness-check
		switch (message.type) {
			case 'processorInitialized':
				if (await shard.scratch.zCard(activeRoomsKey) === rooms.length) {
					await begetRoomProcessQueue(shard, shard.time);
					return true;
				}
				break;
			case 'shutdown': return false;
		}
	}
}();

// Process a game tick
async function tick() {
	await using lock = await gameMutex.acquire();
	performanceTimer.start();

	// Initialize tick
	const time = shard.time;
	const nextTime = time + 1;
	await Promise.all([
		shard.scratch.copy('activeUsers', runnerUsersSetKey(time)),
		processorChannel.publish({ type: 'process', time }),
	]);
	await runnerChannel.publish({ type: 'run', time });

	// Wait for tick to finish
	using timeout = acquireTimeout(
		config.processor.intentAbandonTimeout,
		() => mustNotReject(async () => {
			const rooms = await abandonIntentsForTick(shard, time);
			if (rooms.length > 0) {
				console.log(`Abandoning intents in rooms [${rooms.join(', ')}] for tick ${nextTime}`);
			}
		}));
	let willContinue = true;
	for await (const message of serviceMessages) {
		// eslint-disable-next-line @typescript-eslint/switch-exhaustiveness-check
		switch (message.type) {
			case 'processorInitialized':
				await processorChannel.publish({ type: 'process', time });
				break;

			case 'runnerConnected':
				await runnerChannel.publish({ type: 'run', time });
				break;

			case 'tickFinished': {
				await runShardTickProcessors(shard, time);
				await Promise.all([
					// Setup for next tick
					begetRoomProcessQueue(shard, nextTime),
					// Update game state
					async function() {
						await shard.data.set('time', nextTime);
						await shard.channel.publish({ type: 'tick', time: nextTime });
						shard.time = nextTime;
					}(),
				]);
				return willContinue;
			}

			case 'shutdown':
				willContinue = false;
				break;
		}
	}
}

// Main loop
if (didInitialize) {
	// Watch for shutdown and halt tick delay
	disposable.defer(serviceChannel.listen(message => {
		if (message.type === 'shutdown') {
			tickDelay?.(false);
		}
	}));

	let lastSave = Date.now();
	while (true) {
		// Tick
		const tickWallTime = Date.now();
		if (!await tick()) {
			break;
		}
		const now = Date.now();
		const timeTaken = now - tickWallTime;
		const averageTime = Math.floor(performanceTimer.stop() / 10000) / 100;
		console.log(`Tick ${shard.time} ran in ${timeTaken}ms; avg: ${averageTime}ms`);

		// Maybe save
		if (lastSave + saveInterval < now) {
			lastSave = now;
			mustNotReject(Promise.all([ db.save(), shard.save() ]));
		}

		// Add delay
		const delay = Math.max(0, tickSpeed - (Date.now() - tickWallTime));
		if (delay > 0) {
			using timer = acquireTimeout(delay, () => resolve(true));
			const { promise, resolve } = Promise.withResolvers<boolean>();
			tickDelay = resolve;
			if (!await promise) {
				break;
			}
		}
	}
}

// Forward shutdown message to all services
await Promise.all([
	getProcessorChannel(shard).publish({ type: 'shutdown' }),
	getRunnerChannel(shard).publish({ type: 'shutdown' }),
]);
