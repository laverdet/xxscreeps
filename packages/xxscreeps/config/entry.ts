import { join } from 'node:path';
import { Worker, isMainThread } from 'node:worker_threads';
import { initializeInterruptSignal } from 'xxscreeps/engine/service/signal.js';

// Ensure that required node flags have been supplied, spawn a sub-thread if not
const nodeMajor = Number(process.versions.node.split('.')[0]);
const requiredFlags = [
	// import.meta.resolve stabilized in Node 20.6
	...nodeMajor < 20 ? [ '--experimental-import-meta-resolve' ] : [],
	'--experimental-vm-modules',
];
const noWorkerFlags = [
	'--no-node-snapshot',
];
const extraFlags = (process.env.NODE_OPTIONS ?? '').split(/ /g).filter(flag => flag !== '');
const isMissingFlag = (flag: string) => !process.execArgv.includes(flag) && !extraFlags.includes(flag);
const missingFlags = isMainThread ? requiredFlags.filter(isMissingFlag) : [];
if (missingFlags.length) {
	// In this case we are missing a required flag
	const niceToHaveFlags = [
		'--enable-source-maps',
		'--no-warnings',
	];
	const execArgv = process.execArgv = [
		...process.execArgv.filter(flag => !noWorkerFlags.includes(flag)),
		...extraFlags.filter(flag => !noWorkerFlags.includes(flag)),
		...missingFlags,
		...niceToHaveFlags.filter(isMissingFlag),
	];

	// Start fake top thread and wait for exit
	initializeInterruptSignal();
	process.exit(await new Promise<number>((resolve, reject) => {
		const worker = new Worker(new URL(import.meta.url), {
			argv: process.argv.slice(2),
			execArgv,
			stdin: true,
			workerData: { isTopThread: true },
		});
		worker.on('error', reject);
		worker.on('exit', code => resolve(code));
		worker.on('message', message => {
			if (message === 'EXIT') {
				process.exit(0);
			} else {
				console.error('Received unhandled message from child shim', message);
				process.exit(1);
			}
		});
		process.stdin.pipe(worker.stdin!);
	}));

} else {

	// All required flags were passed
	process.execArgv = process.execArgv.filter(flag => !noWorkerFlags.includes(flag));

	// Get script and remove `dist/config/entry.js` from args
	process.argv.splice(1, 1);
	const specifier = process.argv[1];

	// Load mods (regenerates mods.static)
	await import('./mods/index.js');

	if (specifier) {
		const commands: Record<string, string | undefined> = {
			import: './dist/scripts/scrape-world.js',
			start: './dist/engine/service/launcher.js',
			main: './dist/engine/service/main.js',
			backend: './dist/backend/server.js',
			processor: './dist/engine/service/processor.js',
			runner: './dist/engine/service/runner.js',
			'save-schema': './dist/engine/service/save-schema.js',
			test: './dist/test/run.js',
		};

		// Resolve entry script
		const modulePath = function() {
			try {
				const command = commands[specifier];
				if (command === undefined) {
					// Try to parse as file:// URL, probably a self-invoking worker
					try {
						return `${new URL(specifier)}`;
					} catch {}
					// Resolve as file from cwd
					return import.meta.resolve(join(process.cwd(), specifier));
				} else {
					// Found run alias
					return import.meta.resolve(`${new URL(command, new URL('../..', import.meta.url))}`);
				}
			} catch (error: any) {
				// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
				if (error.code !== 'ERR_MODULE_NOT_FOUND') {
					throw error;
				}
				console.log(`Invalid command or module "${specifier}", built in commands are ${Object.keys(commands).join(', ')}`);
			}
		}();

		// Run it outside of try / catch
		if (modulePath !== undefined) {
			await import(modulePath);
		}

	} else {
		// Start CLI client — connects to the server's Unix socket
		await import('./repl.js');
	}
}
