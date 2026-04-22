import { checkArguments } from 'xxscreeps/config/arguments.js';
import config from 'xxscreeps/config/index.js';
import { importMods } from 'xxscreeps/config/mods/index.js';
import { Database, Shard } from 'xxscreeps/engine/db/index.js';
import * as User from 'xxscreeps/engine/db/user/index.js';
import { getConsoleChannel } from 'xxscreeps/engine/runner/model.js';
import { Worker, waitForWorker } from 'xxscreeps/utility/worker.js';
import { hooks } from './symbols.js';
import { getServiceChannel, handleInterrupt } from './index.js';

const argv = checkArguments({
	boolean: [ 'no-backend', 'no-processor', 'no-runner' ] as const,
	string: [ 'attach-console' ] as const,
});

// Connect to shard
const db = await Database.connect();
const shard = await Shard.connect(db, 'shard0');

// Check for empty world. Also flag a partial import: terrain present but no
// rooms populated means a previous importWorld crashed mid-flight.
const [ terrain, roomCount ] = await Promise.all([
	shard.data.get('terrain', { blob: true }),
	shard.data.scard('rooms'),
]);
if (terrain === null || roomCount === 0) {
	const partial = terrain !== null && roomCount === 0;
	console.log(partial
		? '⚠ Database contains terrain but no rooms — previous import may have failed.'
		: '⚠ Database is empty — no world data found.');
	console.log('  Run `npx xxscreeps import` to seed the default world.');
	console.log('');
}

await importMods('launcher');
await Promise.all([ ...hooks.map('launcher', hook => hook(db, shard)) ]);
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
	const [ , waitForMain ] = getServiceChannel(shard).listenFor(message => message.type === 'mainConnected');
	const main = import('./main.js');
	await Promise.race([ main, waitForMain ]);

	// Race-safety: if SIGINT arrived before main subscribed to serviceChannel,
	// the original shutdown publish had no listener. Re-publish now that main
	// has advertised `mainConnected`, which proves its listener is active.
	if (shutdown.requested) {
		await serviceChannel.publish({ type: 'shutdown' }).catch(() => {});
	}

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
