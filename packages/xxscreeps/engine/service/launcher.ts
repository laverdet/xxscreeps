import { checkArguments } from 'xxscreeps/config/arguments.js';
import config from 'xxscreeps/config/index.js';
import { Database, Shard } from 'xxscreeps/engine/db/index.js';
import * as User from 'xxscreeps/engine/db/user/index.js';
import { getConsoleChannel } from 'xxscreeps/engine/runner/model.js';
import { Worker, waitForWorker } from 'xxscreeps/utility/worker.js';
import { getServiceChannel, handleInterrupt } from './index.js';

const argv = checkArguments({
	boolean: [ 'no-backend', 'no-processor', 'no-runner' ] as const,
	string: [ 'attach-console' ] as const,
});

// Connect to shard
const db = await Database.connect();
const shard = await Shard.connect(db, 'shard0');

const serviceChannel = getServiceChannel(shard);
const shutdown = { requested: false };
handleInterrupt(() => {
	if (shutdown.requested) {
		return;
	}
	shutdown.requested = true;
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
	const [ , waitForMain ] = serviceChannel.listenFor(message => message.type === 'mainConnected');
	const main = import('./main.js');
	await Promise.race([ main, waitForMain ]);

	// Race-safety: SIGINT may have fired before main subscribed to the service
	// channel, in which case the original publish had no listener. Now that
	// main has advertised `mainConnected`, its listener is active — re-publish.
	if (shutdown.requested) {
		await serviceChannel.publish({ type: 'shutdown' }).catch(() => {});
	}

	// Start workers (skip if shutdown already requested — main will exit on its own)
	const services = shutdown.requested
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
