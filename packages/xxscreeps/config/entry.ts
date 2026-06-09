import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { Worker, isMainThread } from 'node:worker_threads';
import { initializeInterruptSignal } from 'xxscreeps/engine/service/signal.js';

// Ensure that required node flags have been supplied, spawn a sub-thread if not
const initialSpecifier = process.argv[2];
const requiredFlags = [
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

	// The Worker re-spawn pipes stdin, which loses the controlling tty needed by `xxscreeps cli`.
	// Re-exec the same node binary directly with stdio inherited so the REPL talks to the terminal.
	if (initialSpecifier === undefined || initialSpecifier === 'cli') {
		const env = { ...process.env };
		delete env.NODE_OPTIONS;
		process.exit(await new Promise<number>((resolve, reject) => {
			const child = spawn(process.execPath, [
				...execArgv,
				...process.argv.slice(1),
			], {
				env,
				stdio: 'inherit',
			});
			child.on('error', reject);
			child.on('exit', code => resolve(code ?? 1));
		}));
	}

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

	// Load pathfinder & mods (regenerates mods.static)
	await Promise.all([
		import('../driver/pathfinder/select.js'),
		import('./mods/index.js'),
	]);

	if (specifier) {
		const commands: Record<string, string | undefined> = {
			import: './dist/scripts/scrape-world.js',
			start: './dist/engine/service/launcher.js',
			main: './dist/engine/service/main.js',
			backend: './dist/backend/server.js',
			cli: './dist/cli/cli.js',
			eval: './dist/cli/eval.js',
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
		// Bare `xxscreeps` opens the interactive REPL.
		await import('../cli/cli.js');
	}
}
