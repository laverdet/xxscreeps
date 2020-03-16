import * as workerThreads from 'worker_threads';
export * from 'worker_threads';
import { Channel } from '~/storage/channel';

export class Worker extends workerThreads.Worker {
	constructor(filename: string, options?: any) {
		super(`${__dirname}/trampoline.js`, {
			...options,
			argv: [ filename, ...options?.argv ?? [] ],
		});
		Channel.initializeWorker(this);
	}
}
