import { checkArguments } from 'xxscreeps/config/arguments.js';
import config from 'xxscreeps/config/index.js';
import { importMods } from 'xxscreeps/config/mods/index.js';
import { Database, Shard } from 'xxscreeps/engine/db/index.js';
import * as User from 'xxscreeps/engine/db/user/index.js';
import { getConsoleChannel } from 'xxscreeps/engine/runner/model.js';
import { Worker, waitForWorker } from 'xxscreeps/utility/worker.js';
import { getServiceChannel, handleInterrupt } from './index.js';
import { setLauncherContext } from './launcher-context.js';

const argv = checkArguments({
	boolean: [ 'no-backend', 'no-processor', 'no-runner' ] as const,
	string: [ 'attach-console' ] as const,
});

// Connect to shard
const db = await Database.connect();
const shard = await Shard.connect(db, 'shard0');
setLauncherContext(db, shard);
await importMods('launcher');
const serviceChannel = getServiceChannel(shard);
let shutdownRequested = false;
handleInterrupt(() => {
	if (shutdownRequested) {
		return;
	}
	shutdownRequested = true;
	console.log('Shutting down...');
	serviceChannel.publish({ type: 'shutdown' }).catch(() => {});
});

try {

	// Attach console for given user
	if (argv['attach-console']) {
		const id = await User.findUserByName(db, argv['attach-console']);
		if (!id) {
			throw new Error(`User: ${argv['attach-console']} not found`);
		}
		const channel = await getConsoleChannel(shard, id).subscribe();
		channel.listen(message => {
			for (const line of JSON.parse(message)) {
				if (line.fd !== 2) {
					console.log(line.data);
				} else {
					console.error(line.data);
				}
			}
		});
	}

	// Start main service
	const [ , waitForMain ] = getServiceChannel(shard).listenFor(message => message.type === 'mainConnected');
	const main = import('./main.js');
	await Promise.race([ main, waitForMain ]);

	const services = shutdownRequested
		? Promise.all([ main ])
		: await async function() {
			const singleThreaded = config.launcher?.singleThreaded;
			if (singleThreaded) {
				const backend = argv['no-backend'] ? undefined : import('xxscreeps/backend/server.js');
				const processor = argv['no-processor'] ? undefined : import('./processor.js');
				const runner = argv['no-runner'] ? undefined : import('./runner.js');
				return Promise.all([ main, backend, processor, runner ]);
			} else {
				const [ backend, processor, runner ] = await Promise.all([
					argv['no-backend'] ? undefined : Worker.create('xxscreeps/backend/server.js'),
					argv['no-processor'] ? undefined : Worker.create('xxscreeps/engine/service/processor.js'),
					argv['no-runner'] ? undefined : Worker.create('xxscreeps/engine/service/runner.js'),
				]);
				return Promise.all([
					main,
					backend && waitForWorker(backend),
					processor && waitForWorker(processor),
					runner && waitForWorker(runner),
				]);
			}
		}();
	await services;
	console.log('💾 Engine shut down successfully.');

} finally {
	db.disconnect();
	shard.disconnect();
}
