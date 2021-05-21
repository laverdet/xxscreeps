import type { Effect, Instance, Values } from 'xxscreeps/utility/types';
import type { Worker } from 'worker_threads';
import { isMainThread, parentPort } from 'worker_threads';
import { Deferred } from 'xxscreeps/utility/async';
import assert from 'assert';
import { staticCast } from 'xxscreeps/utility/utility';

/**
 * Responders generalizes the client/server request/response model for inter-thread/process
 * communication.
 */

type ConnectMessage = {
	type: 'responderConnect';
	clientId: string;
	name: string;
};
type ConnectedMessage = {
	type: 'responderConnected';
	clientId: string;
};
type ConnectionFailedMessage = {
	type: 'responderConnectionFailed';
	clientId: string;
};
type DisconnectMessage = {
	type: 'responderDisconnect';
	clientId: string;
};
type RequestMessage = {
	type: 'responderRequest';
	clientId: string;
	requestId: number;
	method: string;
	payload: any;
};
type ResponseMessage = {
	type: 'responderResponse';
	clientId: string;
	requestId: number;
	payload: any;
	rejection?: true;
};

type ParentMessage = ResponseMessage | ConnectedMessage | ConnectionFailedMessage;
type WorkerMessage = RequestMessage | ConnectMessage | DisconnectMessage;

type AbstractResponderHost = {
	_refs: number;
};
type AbstractResponderClient = {
	readonly _clientId: string;
	readonly _requests: Map<number, Deferred<any>>;
};
export abstract class Responder {
	constructor(public readonly _name?: string) {}
	destroyed() {}
	disconnect() {}
}

// Used in host isolate
const responderHostsByClientId = new Map<string, AbstractResponderHost>();
const responderHostsByName = new Map<string, AbstractResponderHost>();

// User in client isolate
let didInitializeWorker = false;
const responderClientsById = new Map<string, AbstractResponderClient>();
const unlistenByClientId = new Map<string, Effect>();

// Connect to an existing responder
let parentRefs = 0;
export function connect<Type extends AbstractResponderClient>(ctor: new() => Type, name: string): Promise<Type> {
	if (isMainThread) {
		// Connecting to a responder from the parent just returns the host object
		const responder = responderHostsByName.get(name);
		if (responder) {
			++responder._refs;
			return Promise.resolve(responder as never as Type);
		} else {
			return Promise.reject(new Error(`Responder: ${name} does not exist`));
		}

	} else {
		// Check with main thread that this responder is ready
		initializeThisWorker();
		if (++parentRefs === 1) {
			parentPort!.ref();
		}
		return new Promise<Type>((resolve, reject) => {
			// Set up connection ack handler
			const responder = new ctor;
			const listener = (message: ParentMessage) => {
				if (message.clientId === responder._clientId) {
					parentPort!.removeListener('message', listener);
					if (message.type === 'responderConnected') {
						responderClientsById.set(responder._clientId, responder);
						resolve(responder);
					} else {
						assert(message.type === 'responderConnectionFailed');
						reject(new Error(`Responder ${name} does not exist`));
					}
				}
			};
			parentPort!.on('message', listener);

			// Send "connection" request to main thread
			parentPort!.postMessage(staticCast<WorkerMessage>({
				type: 'responderConnect',
				clientId: responder._clientId,
				name,
			}));
		});
	}
}

// Create a responder on the parent thread
export function create<Type extends AbstractResponderHost, Rest extends any[]>(
	ctor: new(name: string, ...args: Rest) => Type,
	name: string,
	...args: Rest
) {
	assert(isMainThread);
	// Only one responder per name should exist
	if (responderHostsByName.has(name)) {
		throw new Error(`Responder: ${name} already exists`);
	}
	responderHostsByName.set(name, undefined as never);
	// Instantiate a new Responder
	try {
		const instance = new ctor(name, ...args);
		responderHostsByName.set(name, instance);
		return instance;
	} catch (err) {
		responderHostsByName.delete(name);
		throw err;
	}
}

// Single listener for all clients in a worker
function initializeThisWorker() {
	if (didInitializeWorker) {
		return;
	}
	didInitializeWorker = true;
	parentPort!.on('message', (message: ParentMessage) => {
		if (message.type === 'responderResponse') {
			const client = responderClientsById.get(message.clientId);
			if (client) {
				const { _requests } = client;
				const request = _requests.get(message.requestId)!;
				_requests.delete(message.requestId);
				if (message.rejection) {
					request.reject(new Error(message.payload));
				} else {
					request.resolve(message.payload);
				}
			}
		}
	});
}

// Called on the parent thread, once per worker created
export function initializeWorker(worker: Worker) {
	worker.on('message', (message: WorkerMessage) => {
		switch (message.type) {
			// Child worker is connecting to parent
			case 'responderConnect': {
				// Check that this responder exists
				const responder = responderHostsByName.get(message.name);
				const { clientId } = message;
				if (responder) {
					// Save parent by client id for responses
					responderHostsByClientId.set(clientId, responder);
					worker.postMessage(staticCast<ParentMessage>({
						type: 'responderConnected',
						clientId,
					}));
					// Sudden disconnect listener
					const exitListener = () => {
						responderHostsByClientId.delete(clientId);
						worker.removeListener('exit', exitListener);
					};
					worker.on('exit', exitListener);
					unlistenByClientId.set(clientId, exitListener);
				} else {
					worker.postMessage(staticCast<ParentMessage>({
						type: 'responderConnectionFailed',
						clientId,
					}));
				}
				break;
			}

			// Child worker is disconnecting
			case 'responderDisconnect': {
				const { clientId } = message;
				responderHostsByClientId.delete(clientId);
				unlistenByClientId.get(clientId)!();
				break;
			}

			// Incoming request from child
			case 'responderRequest': {
				const { clientId, method, payload, requestId } = message;
				const host: undefined | Record<string, (...args: any) => Promise<any>> =
					responderHostsByClientId.get(clientId) as any;
				const request = host === undefined ?
					Promise.reject(new Error('Responder has gone away')) :
					host[method](...payload);
				request.then(payload => {
					worker.postMessage(staticCast<ParentMessage>({
						type: 'responderResponse',
						clientId,
						requestId,
						payload,
					}));
				}, (error: Error) => {
					worker.postMessage(staticCast<ParentMessage>({
						type: 'responderResponse',
						clientId,
						requestId,
						payload: error.message,
						rejection: true,
					}));
				});
				break;
			}

			default:
		}
	});
}

export function ResponderHost<New extends abstract new(...args: any[]) => Responder>(base: New) {
	abstract class Host extends base {
		_refs = 1;

		override disconnect(): { doNotOverrideThisMethod: true } {
			if (--this._refs === 0) {
				responderHostsByName.delete(this._name!);
				this.destroyed();
			}
			return undefined as never;
		}
	}
	return Host;
}

export function ResponderClient<New extends abstract new(...args: any[]) => Responder>(base: New) {
	// Get instance type and promise-returning methods
	type Type = Instance<New>;
	type Methods = Values<{
		[Key in Exclude<Extract<keyof Type, string>, 'request'>]: Type[Key] extends (...args: any) => Promise<any> ? Key : never;
	}>;

	// Return client mixin
	abstract class Client extends base implements AbstractResponderClient {
		#requestId = 0;
		readonly _clientId = `${Math.floor(Math.random() * 2 ** 52)}`;
		readonly _requests = new Map<number, Deferred<any>>();

		override disconnect(): { doNotOverrideThisMethod: true } {
			for (const resolver of this._requests.values()) {
				resolver.reject(new Error('Disconnected from responder'));
			}
			this._requests.clear();
			parentPort!.postMessage(staticCast<WorkerMessage>({
				type: 'responderDisconnect',
				clientId: this._clientId,
			}));
			if (--parentRefs === 0) {
				parentPort!.unref();
			}
			return undefined as never;
		}

		request<Method extends Methods>(method: Method, ...payload: Parameters<Type[Method]>): ReturnType<Type[Method]> {
			const requestId = ++this.#requestId;
			const deferred = new Deferred<any>();
			this._requests.set(requestId, deferred);
			parentPort!.postMessage(staticCast<WorkerMessage>({
				type: 'responderRequest',
				clientId: this._clientId,
				requestId,
				method,
				payload,
			}));
			return deferred.promise as never;
		}
	}
	return Client;
}
