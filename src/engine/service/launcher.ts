import config from 'xxscreeps/config';
import argv from 'xxscreeps/config/arguments';
import * as Fn from 'xxscreeps/utility/functional';
import * as UserSchema from 'xxscreeps/engine/metadata/user';
import { Worker, waitForWorker } from 'xxscreeps/utility/worker';
import { listen } from 'xxscreeps/utility/async';
import { Shard } from 'xxscreeps/engine/model/shard';
import { Mutex } from 'xxscreeps/storage/mutex';
import { getProcessorChannel } from 'xxscreeps/engine/model/processor';
import { getConsoleChannel } from 'xxscreeps/engine/model/user';
import { getRunnerChannel } from 'xxscreeps/engine/runner/model';
import { getServiceChannel } from '.';

// Connect to shard
const shard = await Shard.connect('shard0');
const serviceChannel = await getServiceChannel(shard).subscribe();

try {

	// Attach console for given user
	if (argv['attach-console']) {
		const attachTo = argv['attach-console'];
		const gameMutex = await Mutex.connect('game', shard.data, shard.pubsub);
		try {
			const id = await gameMutex.scope(async() => {
				const userIds = await shard.data.smembers('users');
				for (const userId of userIds) {
					const user = UserSchema.read(await shard.blob.reqBuffer(`user/${userId}/info`));
					if (user.username === attachTo) {
						return userId;
					}
				}
				throw new Error(`User: ${attachTo} not found`);
			});
			const channel = await getConsoleChannel(shard, id).subscribe();
			channel.listen(message => {
				if (message.type === 'log') {
					console.log(message.value);
				} else if (message.type === 'error') {
					console.error(message.value);
				}
			});
		} finally {
			await gameMutex.disconnect();
		}
	}

	// Start main service
	const waitForMain = async function() {
		for await (const message of serviceChannel) {
			if (message.type === 'mainConnected') {
				return true;
			}
		}
	}();
	const main = import('./main');
	await Promise.race([ main, waitForMain ]);

	// Ctrl+C listener
	let terminating = false;
	const killListener = listen(process, 'SIGINT', () => {
		// `npm run` will send two interrupts, so we have to swallow the extra
		if (terminating) {
			return;
		}
		terminating = true;
		const timeout = setTimeout(killListener, 250);
		timeout.unref();
		console.log('Shutting down...');

		// Send shutdown message to main. Once main shuts down send shutdown message to processor and
		// runner
		const shutdownUnlisten = serviceChannel.listen(message => {
			if (message.type === 'mainDisconnected') {
				shutdownUnlisten();
				Promise.all([
					getProcessorChannel(shard).publish({ type: 'shutdown' }),
					getRunnerChannel(shard).publish({ type: 'shutdown' }),
				]).then(
					() => console.log('Engine shut down successfully'),
					console.error);
			}
		});
		serviceChannel.publish({ type: 'shutdown' }).catch(console.error);
	});

	// Start workers
	const { processorWorkers, runnerWorkers, singleThreaded } = config.launcher;
	if (singleThreaded) {
		const backend = import('xxscreeps/backend/server');
		const processor = import('./processor');
		const runner = import('./runner');
		await Promise.all([ main, backend, processor, runner ]);
	} else {
		const backend = await Worker.create('xxscreeps/backend/server');
		const processors = await Promise.all(Fn.map(Fn.range(processorWorkers), () =>
			Worker.create('xxscreeps/engine/service/processor')));
		const runners = await Promise.all(Fn.map(Fn.range(runnerWorkers), () =>
			Worker.create('xxscreeps/engine/service/runner')));
		await Promise.all([
			main,
			Promise.all(processors.map(worker => waitForWorker(worker))),
			Promise.all(runners.map(worker => waitForWorker(worker))),
			waitForWorker(backend),
		]);
	}

} finally {
	shard.disconnect();
	serviceChannel.disconnect();
}
