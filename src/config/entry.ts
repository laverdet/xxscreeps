import { join } from 'path';
import { Worker, isMainThread, parentPort, workerData } from 'worker_threads';

// Ensure that required node flags have been supplied, spawn a sub-thread if not
const requiredFlags = [
	'--experimental-specifier-resolution=node',
	'--experimental-import-meta-resolve',
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
		...process.execArgv,
		...extraFlags,
		...missingFlags,
		...niceToHaveFlags.filter(isMissingFlag),
	];
	process.exit(await new Promise<number>((resolve, reject) => {
		const worker = new Worker(new URL(import.meta.url), {
			argv: process.argv.slice(2),
			execArgv,
			stdin: true,
			workerData: { isTopThread: true },
		});
		worker.on('error', error => reject(error));
		worker.on('exit', code => resolve(code));
		worker.on('message', message => {
			if (message === 'EXIT') {
				process.exit(0);
			} else {
				console.error('Received unhandled message from child shim', message);
				process.exit(1);
			}
		});
		process.on('SIGINT', () => {
			worker.postMessage('SIGINT');
			setTimeout(() => process.removeAllListeners('SIGINT'), 250);
		});
		process.stdin.pipe(worker.stdin!);
	}));

} else {

	// All required flags were passed

	if (!isMainThread && workerData?.isTopThread) {
		// This is a fake top-thread, so the real top thread will send SIGINT messages
		parentPort!.on('message', message => {
			if (message === 'SIGINT') {
				if (!process.emit('SIGINT' as never)) {
					parentPort!.postMessage('EXIT');
				}
			}
		}).unref();
	}

	// `registerStorageProvider` needs to be imported early to allow local keyval/blob providers to
	// register
	await import('xxscreeps/engine/db/storage/register');

	// Get script and remove `dist/config/entry.js` from args
	process.argv.splice(1, 1);
	const specifier = process.argv[1];

	// Load mods
	await Promise.all([
		import('./mods'),
		import('./global'),
	]);

	if (specifier && !specifier.startsWith('-')) {
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
		const modulePath = await async function() {
			try {
				const command = commands[specifier];
				if (command) {
					// Found run alias
					return await import.meta.resolve!(`${new URL(command, new URL('../..', import.meta.url))}`);
				} else {
					// Try to parse as file:// URL, probably a self-invoking worker
					try {
						return `${new URL(specifier)}`;
					} catch (err) {}
					// Resolve as file from cwd
					return await import.meta.resolve!(join(process.cwd(), specifier), import.meta.url);
				}
			} catch (error: any) {
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
		// Start repl
		if (!isMainThread) {
			console.log(`REPL is running in a sub-thread, this will not be a good experience! Please run node with ${requiredFlags.join(' ')} to avoid this.`);
		}
		const repl = await import('repl');
		repl.start('> ');
	}
}
