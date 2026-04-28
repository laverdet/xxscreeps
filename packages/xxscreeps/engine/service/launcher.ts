import { checkArguments } from 'xxscreeps/config/arguments.js';
import config from 'xxscreeps/config/index.js';
import { Database, Shard } from 'xxscreeps/engine/db/index.js';
import * as User from 'xxscreeps/engine/db/user/index.js';
import { getConsoleChannel } from 'xxscreeps/engine/runner/model.js';
import { mustNotReject } from 'xxscreeps/utility/async.js';
import { Worker, waitForWorker } from 'xxscreeps/utility/worker.js';
import { getServiceChannel, handleInterrupt } from './index.js';

const argv = checkArguments({
	boolean: [ 'no-backend', 'no-processor', 'no-runner' ] as const,
	string: [ 'attach-console' ] as const,
});

// Connect to shard
using db = await Database.connect();
using shard = await Shard.connect(db, 'shard0');
await using disposable = new AsyncDisposableStack();

// Open databases, saving on exit (graceful or not). The local database providers save
// asynchronously so the "disconnect" effect can't do it. Since the redis provider continually saves
// on its own, saving even on ungraceful exit brings them more in line.
disposable.defer(async () => {
	await Promise.all([ db.save(), shard.save()	]);
	console.log('💾 Service shut down successfully.');
});

// Attach console for given user
if (argv['attach-console'] !== undefined) {
	const id = await User.findUserByName(db, argv['attach-console']);
	if (id === null) {
		throw new Error(`User: ${argv['attach-console']} not found`);
	}
	const channel = disposable.adopt(
		await getConsoleChannel(shard, id).subscribe(),
		subscription => subscription.disconnect());
	channel.listen(message => {
		for (const line of JSON.parse(message)) {
			if (line.fd === 2) {
				console.error(line.data);
			} else {
				console.log(line.data);
			}
		}
	});
}

// Start main service
const [ main ] = await async function() {
	using disposable = new DisposableStack();
	const [ effect, waitForMain ] = getServiceChannel(shard).listenFor(message => message.type === 'mainConnected');
	disposable.defer(effect);
	const main = import('./main.js');
	await Promise.race([ main, waitForMain ]);
	// nb: Do not wait on 'main' to complete here
	return [ main ];
}();

// Interrupt handler (after 'main' initialized). If it hasn't initialized then the default 'SIGINT'
// will just terminate.
disposable.defer(handleInterrupt(() => {
	console.log('Shutting down...');
	mustNotReject(getServiceChannel(shard).publish({ type: 'shutdown' }));
}));

// Start workers
const singleThreaded = config.launcher?.singleThreaded;
const { services, backend } = function() {
	if (singleThreaded) {
		const backend = argv['no-backend'] ? null : import('xxscreeps/backend/server.js');
		const processor = argv['no-processor'] ? null : import('./processor.js');
		const runner = argv['no-runner'] ? null : import('./runner.js');
		const services = Promise.all([ main, processor, runner ]);
		return { services, backend };
	} else {
		const backend = argv['no-backend'] ? null : Worker.create('xxscreeps/backend/server.js');
		const processor = argv['no-processor'] ? null : Worker.create('xxscreeps/engine/service/processor.js');
		const runner = argv['no-runner'] ? null : Worker.create('xxscreeps/engine/service/runner.js');
		const services = Promise.all([ main, waitForWorker(processor), waitForWorker(runner) ]);
		return { services, backend };
	}
}();
await Promise.all([ services, backend ]);
