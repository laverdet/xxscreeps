import * as workerThreads from 'worker_threads';
export * from 'worker_threads';
import * as Responder from 'xxscreeps/engine/db/storage/local/responder';
import { LocalPubSubProvider } from 'xxscreeps/engine/db/storage/local/pubsub';
import argv from 'xxscreeps/config/arguments';
const entryShim = new URL(await import.meta.resolve('xxscreeps/config/entry'));

const workerArgs = [
	...argv.config ? [ '--config', argv.config ] : [],
];

export class Worker extends workerThreads.Worker {
	constructor(filename: string | URL, options: workerThreads.WorkerOptions = {}) {
		super(entryShim, {
			...options,
			argv: [
				filename,
				...workerArgs,
				...options.argv ? options.argv : [],
			],
		});
		LocalPubSubProvider.initializeWorker(this);
		Responder.initializeWorker(this);
	}

	static async create(module: string, options: workerThreads.WorkerOptions = {}) {
		const url = new URL(await import.meta.resolve(module));
		return new Worker(url, options);
	}
}

export function waitForWorker(worker: Worker) {
	return new Promise<void>((resolve, reject) => {
		worker.on('exit', code => {
			if (code === 0) {
				resolve();
			} else {
				reject(new Error(`Worker exitted with code: ${code}`));
			}
		});
	});
}
