import 'xxscreeps/game/objects/structures/spawn';
import os from 'os';
import config from 'xxscreeps/engine/config';
import argv from 'xxscreeps/config/arguments';
import { Worker, waitForWorker } from 'xxscreeps/util/worker';
import { listen } from 'xxscreeps/util/utility';
import { ConsoleMessage } from 'xxscreeps/engine/metadata/code';
import * as GameSchema from 'xxscreeps/engine/metadata/game';
import * as UserSchema from 'xxscreeps/engine/metadata/user';
import * as Storage from 'xxscreeps/storage';
import { Channel } from 'xxscreeps/storage/channel';
import { Mutex } from 'xxscreeps/storage/mutex';

import { ProcessorMessage, RunnerMessage, ServiceMessage } from '.';

// Start shared blob service
await Storage.initialize();
const storage = await Storage.connect('shard0');
const serviceChannel = await new Channel<ServiceMessage>(storage, 'service').subscribe();

try {

	// Attach console for given user
	if (argv['attach-console']) {
		const attachTo = argv['attach-console'];
		const gameMutex = await Mutex.connect(storage, 'game');
		try {
			const id = await gameMutex.scope(async() => {
				const { persistence } = storage;
				const userIds = GameSchema.read(await persistence.get('game')).users;
				for (const userId of userIds) {
					const user = UserSchema.read(await persistence.get(`user/${userId}/info`));
					if (user.username === attachTo) {
						return userId;
					}
				}
				throw new Error(`User: ${attachTo} not found`);
			});
			const channel = await new Channel<ConsoleMessage>(storage, `user/${id}/console`).subscribe();
			channel.listen(message => {
				if (message.type === 'console') {
					console.log(message.log);
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
			shutdownUnlisten();
			if (message.type === 'mainDisconnected') {
				Promise.all([
					new Channel<ProcessorMessage>(storage, 'processor').publish({ type: 'shutdown' }),
					new Channel<RunnerMessage>(storage, 'runner').publish({ type: 'shutdown' }),
				]).catch(console.error);
			}
		});
		serviceChannel.publish({ type: 'shutdown' }).catch(console.error);
	});

	// Start workers
	const { processorWorkers, runnerWorkers, singleThreaded } = config.launcher ?? {};
	if (singleThreaded) {
		const backend = import('xxscreeps/backend/server');
		const processor = import('./processor');
		const runner = import('./runner');
		await Promise.all([ main, backend, processor, runner ]);
	} else {
		const processorCount = processorWorkers ?? (os.cpus().length >> 1) + 1;
		const runnerCount = runnerWorkers ?? 1;
		const backend = new Worker('xxscreeps/backend/server');
		const processors = Array(processorCount).fill(undefined).map(() =>
			new Worker('xxscreeps/engine/service/processor'));
		const runners = Array(runnerCount).fill(undefined).map(() =>
			new Worker('xxscreeps/engine/service/runner'));
		await Promise.all([
			main,
			Promise.all(processors.map(worker => waitForWorker(worker))),
			Promise.all(runners.map(worker => waitForWorker(worker))),
			waitForWorker(backend),
		]);
	}

} catch (err) {
	// Show error now, before waiting for shut down
	console.error('Uncaught exception ', err);
	serviceChannel.publish({ type: 'shutdown' }).catch(console.error);

} finally {
	// Shut down shared services
	storage.disconnect();
	Storage.terminate();
	serviceChannel.disconnect();
	process.exit();
}
