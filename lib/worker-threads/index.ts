import * as workerThreads from 'worker_threads';
export * from 'worker_threads';
import { Channel } from '~/storage/channel';
import { Responder } from '~/storage/responder';

export class Worker extends workerThreads.Worker {
	constructor(filename: string, options?: any) {
		super(`${__dirname}/trampoline.js`, {
			...options,
			argv: [ filename, ...options?.argv ?? [] ],
		});
		Channel.initializeWorker(this);
		Responder.initializeWorker(this);
	}
}
