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
			if (typeof message === 'object' && message.SIGINT === false) {
				process.exit(0);
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
				parentPort!.postMessage({ SIGINT: process.emit('SIGINT' as never) });
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
	await import('./mods');

	if (specifier && !specifier.startsWith('-')) {
		// Run
		const base = new URL('../..', import.meta.url);
		await import(`${new URL({
			import: './dist/scripts/scrape-world.js',
			start: './dist/engine/service/launcher.js',
			main: './dist/engine/service/main.js',
			backend: './dist/backend/server.js',
			processor: './dist/engine/service/processor.js',
			runner: './dist/engine/service/runner.js',
		}[specifier] ?? specifier, base)}`);
	} else {
		// Start repl
		if (!isMainThread) {
			console.log(`REPL is running in a sub-thread, this will not be a good experience! Please run node with ${requiredFlags.join(' ')} to avoid this.`);
		}
		const repl = await import('repl');
		repl.start('> ');
	}
}
