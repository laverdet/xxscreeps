import * as workerThreads from 'worker_threads';
export * from 'worker_threads';
import { LocalPubSubProvider } from 'xxscreeps/storage/local/pubsub';
import * as Responder from 'xxscreeps/storage/local/responder';

export class Worker extends workerThreads.Worker {
	constructor(filename: string, options: workerThreads.WorkerOptions = {}) {
		super(filename, options);
		LocalPubSubProvider.initializeWorker(this);
		Responder.initializeWorker(this);
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
