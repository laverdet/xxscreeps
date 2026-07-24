import type { Effect } from './types.js';
import type { MessagePort } from 'node:worker_threads';
import { EventEmitter } from 'node:events';
import { MessageChannel, parentPort } from 'node:worker_threads';
import { messagePortToIterable } from 'xxscreeps/engine/db/storage/local/port.js';
import { Fn } from 'xxscreeps/functional/fn.js';
import { Deferred } from './async.js';
import { Worker, waitForWorker } from './worker.js';

interface ResponderFrame { id: number }
interface RequestMessage extends ResponderFrame {
	payload: unknown;
}
interface PayloadResponse extends ResponderFrame {
	payload: unknown;
	rejection?: false;
}
interface RejectionResponse extends ResponderFrame {
	payload: string;
	rejection: true;
}
type ResponseMessage = PayloadResponse | RejectionResponse;
type ResponderMessage =
	{ type?: never } |
	{ type: 'responderReady'; port: MessagePort };

type ResponderResult<Type, Result> = [ Effect, (payload: Type) => Promise<Result> ];
const localEmitter = new EventEmitter();

export async function negotiateResponderClient<Type, Result>(path: string, singleThread?: boolean) {
	interface Adapter {
		onMessage: (fn: (message: ResponderMessage) => void) => void;
		onClose: (fn: (err: unknown) => void) => void;
		wait: () => Promise<void>;
	}
	const { onMessage, onClose, wait } = function(): Adapter {
		if (singleThread) {
			const worker = import(`${path}?singleThread=1`);
			return {
				onMessage(fn) { localEmitter.on('message', fn); },
				onClose(fn) { worker.catch(err => fn(err)); },
				wait: () => worker,
			};
		} else {
			const worker = Worker.create(path);
			return {
				onMessage(fn) { worker.on('message', fn); },
				onClose(fn) { worker.on('exit', () => fn(new Error('Processor failed to initialize'))); },
				wait: () => waitForWorker(worker),
			};
		}
	}();
	const [ close, responder ] = await new Promise<ResponderResult<Type, Result>>((resolve, reject) => {
		onClose(error => reject(error));
		onMessage(message => {
			if (message.type === 'responderReady') {
				resolve(makeBasicResponderClient(message.port));
			}
		});
	});
	return { close, responder, wait };
}

export function makeBasicResponderClient<Type, Result>(port: MessagePort): ResponderResult<Type, Result> {
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
		for (const request of requestsById.values()) {
			request.reject(new Error('Worker is dead'));
		}
	});
	return [
		() => {
			alive = false;
			if (pending === 0) {
				port.close();
			}
		},
		(payload: Type) => {
			const deferred = new Deferred<Result>();
			++pending;
			if (alive) {
				const id = ++currentId;
				requestsById.set(id, deferred);
				port.postMessage({ id, payload });
			} else {
				deferred.reject(new Error('Worker is dead'));
			}
			return deferred.promise;
		},
	];
}

export async function makeBasicResponderHost<Type>(url: string, implementation: (payload: Type) => Promise<any>) {
	const { port1, port2 } = new MessageChannel();
	const readyMessage: ResponderMessage = {
		type: 'responderReady',
		port: port1,
	};
	if (new URL(url).searchParams.get('singleThread') === null) {
		parentPort!.postMessage(readyMessage, [ port1 ]);
	} else {
		localEmitter.emit('message', readyMessage);
	}
	const responses = Fn.distribute(messagePortToIterable<RequestMessage>(port2), 16, async function*(messages): AsyncIterable<ResponseMessage> {
		for await (const message of messages) {
			const { payload, id } = message;
			try {
				yield { id, payload: await implementation(payload as Type) };
			} catch (error: unknown) {
				// @ts-expect-error
				const stack = error.stack as string;
				yield { id, payload: stack, rejection: true };
			}
		}
	});
	for await (const response of responses) {
		port2.postMessage(response);
	}
}
