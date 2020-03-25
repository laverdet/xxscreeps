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
			// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
			if (message.type === 'mainConnected') {
				return true;
			}
		}
	}();
	const main = Main();
	await Promise.race([ main, waitForMain ]);
	mainChannel.disconnect();

	// Start workers
	const backend = Backend();
	const processor = Processor();
	const runner = Runner();
	await Promise.race([ main, backend, processor, runner ]);
});
