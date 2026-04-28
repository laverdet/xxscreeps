import type { WorkerOptions } from 'node:worker_threads';
import { Worker as NodeWorker } from 'node:worker_threads';
import * as PubSub from 'xxscreeps/engine/db/storage/local/pubsub.js';
import * as Responder from 'xxscreeps/engine/db/storage/local/responder.js';

export { isTopThread } from 'xxscreeps/config/raw.js';

const entryShim = new URL(import.meta.resolve('xxscreeps/config/entry.js'));

export class Worker extends NodeWorker {
	constructor(filename: string | URL, options: WorkerOptions = {}) {
		super(entryShim, {
			...options,
			argv: [
				filename,
				...options.argv ? options.argv : [],
			],
			execArgv: process.execArgv,
		});
		PubSub.initializeWorker(this);
		Responder.initializeWorker(this);
	}

	static create(module: string, options: WorkerOptions = {}) {
		const url = new URL(import.meta.resolve(module));
		return new Worker(url, options);
	}
}

export function waitForWorker(worker: Worker): Promise<void>;
export function waitForWorker(worker: Worker | null): Promise<void> | undefined;
export function waitForWorker(worker: Worker | null) {
	if (worker) {
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
}
