import type { Effect } from './types';
import type { MessagePort } from 'worker_threads';
import * as Fn from 'xxscreeps/utility/functional';
import { EventEmitter } from 'events';
import { Deferred, mustNotReject } from './async';
import { staticCast } from './utility';
import { Worker, waitForWorker } from './worker';

type RequestMessage = {
	id: number;
	payload: unknown;
};
type ResponseMessage = {
	id: number;
} & ({
	payload: unknown;
	rejection?: false;
} | {
	payload: string;
	rejection: true;
});

type ResponderResult<Type> = [ Effect, (payload: Type) => Promise<void> ];

export const localEmitter = new EventEmitter;

export async function negotiateResponderClient<Type>(path: string, singleThread?: boolean) {
	const { onMessage, onClose, wait } = await async function(): Promise<{
		onMessage(fn: (message: any) => void): void;
		onClose(fn: (err: any) => void): void;
		wait: () => Promise<void>;
	}> {
		if (singleThread) {
			const worker = import(`${path}?singleThread=1`);
			return {
				onMessage(fn) { localEmitter.on('message', fn) },
				onClose(fn) { worker.catch(err => fn(err)) },
				wait: () => worker,
			};
		} else {
			const worker = await Worker.create(path);
			return {
				onMessage(fn) { worker.on('message', fn) },
				onClose(fn) { worker.on('exit', () => fn(new Error('Processor failed to initialize'))) },
				wait: () => waitForWorker(worker),
			};
		}
	}();
	const [ close, responder ] = await new Promise<ResponderResult<Type>>((resolve, reject) => {
		onClose(err => reject(err));
		onMessage(message => {
			if (message.type === 'processorReady') {
				resolve(makeBasicResponderClient(message.port));
			}
		});
	});
	return { close, responder, wait };
}

export function makeBasicResponderClient<Type>(port: MessagePort): ResponderResult<Type> {
	let currentId = 0;
	let alive = true;
	let pending = 0;
	const requestsById = new Map<number, Deferred<any>>();
	port.on('message', (message: ResponseMessage) => {
		const { id } = message;
		const request = requestsById.get(id)!;
		requestsById.delete(id);
		if (message.rejection) {
			request.reject(new Error(message.payload));
		} else {
			request.resolve(message.payload);
		}
		if (--pending === 0 && !alive) {
			port.close();
		}
	});
	port.on('close', () => {
		alive = false;
		Fn.forEach(requestsById.values(), request => request.reject(new Error('Responder died')));
	});
	return [
		() => {
			alive = false;
			if (pending === 0) {
				port.close();
			}
		},
		(payload: Type) => {
			const deferred = new Deferred<void>();
			++pending;
			if (alive) {
				const id = ++currentId;
				requestsById.set(id, deferred);
				port.postMessage({ type: 'processorRequest', id, payload });
			} else {
				deferred.reject(new Error('Worker is dead'));
			}
			return deferred.promise;
		},
	];
}

export async function makeBasicResponderHost<Type>(port: MessagePort, implementation: (payload: Type) => Promise<void>) {
	return new Promise<void>(resolve => {
		let alive = true;
		let pending = 0;
		port.on('close', () => {
			alive = false;
			if (pending === 0) {
				resolve();
			}
		});
		port.on('message', (message: RequestMessage) => mustNotReject(async() => {
			const { payload, id } = message;
			++pending;
			try {
				port.postMessage(staticCast<ResponseMessage>({
					id,
					payload: await implementation(payload as Type),
				}));
			} catch (err) {
				port.postMessage(staticCast<ResponseMessage>({
					id,
					payload: err.message,
					rejection: true,
				}));
			} finally {
				if (--pending === 0 && !alive) {
					resolve();
				}
			}
		}));
	});
}
