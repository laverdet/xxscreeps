import { Worker, waitForWorker } from '~/lib/worker-threads';
import { topLevelTask } from '~/lib/task';
import { Channel } from '~/storage/channel';

import Backend from '~/backend/server';
import Main from './main';
import Processor from './processor';
import Runner from './runner';
import { MainMessage } from '.';

topLevelTask(async() => {
	// Start main service
	const mainChannel = await Channel.connect<MainMessage>('main');
	const waitForMain = async function() {
		for await (const message of mainChannel) {
			if (message.type === 'mainConnected') {
				return true;
			}
		}
	}();
	const main = Main();
	await Promise.race([ main, waitForMain ]);
	mainChannel.disconnect();

	// Start workers
	// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
	if (true) {
		const backend = Backend();
		const processor = Processor();
		const runner = Runner();
		await Promise.all([ main, backend, processor, runner ]);
	} else {
		const backend = new Worker('~/backend/server', { runDefault: true });
		const processors = Array(2).fill(0).map(() => new Worker('~/engine/service/processor', { runDefault: true }));
		const runner = new Worker('~/engine/service/runner', { runDefault: true });
		await Promise.all([
			main,
			processors.map(worker => waitForWorker(worker)),
			waitForWorker(backend),
			waitForWorker(runner),
		]);
	}
});
