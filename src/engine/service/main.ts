import { AveragingTimer } from 'xxscreeps/utility/averaging-timer';
import { Deferred } from 'xxscreeps/utility/async';
import { Shard } from 'xxscreeps/engine/shard';
import { Mutex } from 'xxscreeps/engine/storage/mutex';
import config from 'xxscreeps/config';
import { getProcessorChannel } from 'xxscreeps/engine/processor/model';
import { getRunnerChannel, runnerUsersSetKey } from 'xxscreeps/engine/runner/model';
import { getServiceChannel } from '.';

// Open channels
const shard = await Shard.connect('shard0');
const processorChannel = getProcessorChannel(shard);
const runnerChannel = getRunnerChannel(shard);
const [ gameMutex, serviceSubscription ] = await Promise.all([
	Mutex.connect('game', shard.data, shard.pubsub),
	getServiceChannel(shard).subscribe(),
]);

// Ctrl+C handler
let delayShutdown: Deferred<boolean> | undefined;
let shuttingDown = false;
serviceSubscription.listen(message => {
	if (message.type === 'shutdown') {
		shuttingDown = true;
		delayShutdown?.resolve(false);
	}
});

// Run main game processing loop
const performanceTimer = new AveragingTimer(1000);

try {
	// Initialize scratch state
	const [ rooms, users ] = await Promise.all([
		shard.data.smembers('rooms'),
		shard.data.smembers('users'),
		shard.scratch.flushdb(),
	]);
	await Promise.all([
		shard.scratch.sadd('initializeRooms', rooms),
		shard.scratch.sadd('users', users),
	]);

	// Wait for processors to connect and initialize world state
	await serviceSubscription.publish({ type: 'mainConnected' });
	for await (const message of serviceSubscription) {
		if (message.type === 'processorInitialized') {
			break;
		}
	}

	// Game loop
	do {
		const timeStartedLoop = Date.now();
		performanceTimer.start();
		await gameMutex.scope(async() => {
			// Initialize
			const time = shard.time + 1;
			await shard.scratch.copy('users', runnerUsersSetKey(time));
			await Promise.all([
				processorChannel.publish({ type: 'process', time }),
				runnerChannel.publish({ type: 'run', time }),
			]);

			// Wait for tick to finish
			for await (const message of serviceSubscription) {
				if (message.type === 'processorInitialized') {
					await processorChannel.publish({ type: 'process', time });
				} else if (message.type === 'runnerConnected') {
					await runnerChannel.publish({ type: 'run', time });
				} else if (message.type === 'tickFinished') {
					break;
				}
			}

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
		if (shuttingDown) {
			break;
		}

		// Add delay
		const delay = Math.max(0, config.game.tickSpeed - (Date.now() - timeStartedLoop));
		if (delay > 0) {
			delayShutdown = new Deferred;
			const { promise } = delayShutdown;
			setTimeout(() => delayShutdown!.resolve(true), delay).unref();
			if (!await promise) {
				break;
			}
		}
	} while (true);

	// Save on graceful exit
	await Promise.all([
		shard.blob.save(),
		shard.data.save(),
		shard.scratch.save(),
	]);

} finally {
	// Clean up
	await gameMutex.disconnect();
	await serviceSubscription.publish({ type: 'mainDisconnected' });
	serviceSubscription.disconnect();
	shard.disconnect();
}
