import { topLevelTask } from '~/lib/task';
import { Channel } from '~/storage/channel';
import Main from './main';
import Processor from './processor';
import Runner from './runner';
import { ServiceMessage } from '.';

topLevelTask(async() => {
	// Start main service
	const serviceChannel = await Channel.connect<ServiceMessage>('service');
	const waitForMain = async function() {
		for await (const message of serviceChannel) {
			// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
			if (message.type === 'mainConnected') {
				return true;
			}
		}
	}();
	const main = Main();
	await Promise.race([ main, waitForMain ]);
	serviceChannel.disconnect();

	// Start workers
	const processor = Processor();
	const runner = Runner();
	await Promise.race([ main, processor, runner ]);
});
