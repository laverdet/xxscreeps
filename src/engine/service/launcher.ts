import minimist from 'minimist';
import config from 'xxscreeps/config';
import * as User from 'xxscreeps/engine/db/user';
import { Worker, waitForWorker } from 'xxscreeps/utility/worker';
import { listen, mustNotReject } from 'xxscreeps/utility/async';
import { Database, Shard } from 'xxscreeps/engine/db';
import { getProcessorChannel } from 'xxscreeps/engine/processor/model';
import { getConsoleChannel, getRunnerChannel } from 'xxscreeps/engine/runner/model';
import { getServiceChannel } from '.';

const argv = minimist(process.argv.slice(2), {
	string: [ 'attach-console' ],
	unknown: param => { throw new Error(`Unknown argument: ${param}`) },
});

// Connect to shard
const db = await Database.connect();
const shard = await Shard.connect(db, 'shard0');
const serviceChannel = await getServiceChannel(shard).subscribe();

try {

	// Attach console for given user
	if (argv['attach-console']) {
		const id = await User.findUserByName(db, argv['attach-console']);
		if (!id) {
			throw new Error(`User: ${argv['attach-console']} not found`);
		}
		const channel = await getConsoleChannel(shard, id).subscribe();
		channel.listen(message => {
			if (message.type === 'log') {
				console.log(message.value);
			} else if (message.type === 'error') {
				console.error(message.value);
			}
		});
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
				mustNotReject(Promise.all([
					getProcessorChannel(shard).publish({ type: 'shutdown' }),
					getRunnerChannel(shard).publish({ type: 'shutdown' }),
				]));
			}
		});
		serviceChannel.publish({ type: 'shutdown' }).catch(console.error);
	});

	// Start workers
	const singleThreaded = config.launcher?.singleThreaded;
	const { services, backend } = await async function() {
		if (singleThreaded) {
			const backend = import('xxscreeps/backend/server');
			const processor = import('./processor');
			const runner = import('./runner');
			const services = Promise.all([ main, processor, runner ]);
			return { services, backend };
		} else {
			const [ backend, processor, runner ] = await Promise.all([
				Worker.create('xxscreeps/backend/server'),
				Worker.create('xxscreeps/engine/service/processor'),
				Worker.create('xxscreeps/engine/service/runner'),
			]);
			const services = Promise.all([ main, waitForWorker(processor), waitForWorker(runner) ]);
			return { services, backend };
		}
	}();
	await Promise.all([
		services.then(() => console.log('💾 Engine shut down successfully.')),
		backend,
	]);

} finally {
	db.disconnect();
	shard.disconnect();
	serviceChannel.disconnect();
}
