import os from 'os';
import config from '~/engine/config';
import { Worker, waitForWorker } from '~/lib/worker-threads';
import { topLevelTask } from '~/lib/task';
import { listen } from '~/lib/utility';
import { BlobStorage } from '~/storage/blob';
import { Channel } from '~/storage/channel';

import Backend from '~/backend/server';
import Main from './main';
import Processor from './processor';
import Runner from './runner';
import { ProcessorMessage, RunnerMessage, ServiceMessage } from '.';

topLevelTask(async() => {
	// Start shared blob service
	const blobStorage = await BlobStorage.create();
	const serviceChannel = await Channel.connect<ServiceMessage>('service');

	try {
		// Start main service
		const waitForMain = async function() {
			for await (const message of serviceChannel) {
				if (message.type === 'mainConnected') {
					return true;
				}
			}
		}();
		const main = Main();
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
					Channel.publish<ProcessorMessage>('processor', { type: 'shutdown' });
					Channel.publish<RunnerMessage>('runner', { type: 'shutdown' });
				}
			});
			serviceChannel.publish({ type: 'shutdown' });
		});

		// Start workers
		const { processorWorkers, runnerWorkers, singleThreaded } = config.launcher ?? {};
		if (singleThreaded) {
			const backend = Backend();
			const processor = Processor();
			const runner = Runner();
			await Promise.all([ main, backend, processor, runner ]);
		} else {
			const processorCount = processorWorkers ?? (os.cpus().length >> 1) + 1;
			const runnerCount = runnerWorkers ?? 1;
			const backend = new Worker('~/backend/server', { runDefault: true });
			const processors = Array(processorCount).fill(undefined).map(() =>
				new Worker('~/engine/service/processor', { runDefault: true }));
			const runners = Array(runnerCount).fill(undefined).map(() =>
				new Worker('~/engine/service/runner', { runDefault: true }));
			await Promise.all([
				main,
				Promise.all(processors.map(worker => waitForWorker(worker))),
				Promise.all(runners.map(worker => waitForWorker(worker))),
				waitForWorker(backend),
			]);
		}

	} finally {
		// Shut down shared services
		await blobStorage.flush();
		blobStorage.disconnect();
		serviceChannel.disconnect();
	}
});
