import type { Effect, MaybePromise } from 'xxscreeps/utility/types';
import type { Worker } from 'worker_threads';
import assert from 'assert';
import { parentPort } from 'worker_threads';
import { Deferred } from 'xxscreeps/utility/async';
import { staticCast } from 'xxscreeps/utility/utility';
import { isTopThread } from 'xxscreeps/utility/worker';

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
	payload: unknown[];
};
type ResponseMessage = {
	type: 'responderResponse';
	clientId: string;
	requestId: number;
} & ({
	payload: unknown;
	rejection?: false;
} | {
	payload: string;
	rejection: true;
});

type ParentMessage = ResponseMessage | ConnectedMessage | ConnectionFailedMessage;
type WorkerMessage = RequestMessage | ConnectMessage | DisconnectMessage;

export class Responder {
	static release(responder: Responder) {
		responder.release();
	}

	protected release() {}
}

abstract class ResponderClient {
	#disconnected = false;
	#requestId = 0;
	readonly #clientId = `${Math.floor(Math.random() * 2 ** 52)}`;
	readonly #requests = new Map<number, Deferred<any>>();

	static create<Type extends ResponderClient>(constructor: new() => Type) {
		const client = new constructor;
		const effect: Effect = () => client.#disconnect();
		return { clientId: client.#clientId, effect, client };
	}

	static response(client: ResponderClient, requestId: number, message: ResponseMessage) {
		const request = client.#requests.get(requestId)!;
		client.#requests.delete(requestId);
		if (message.rejection) {
			request.reject(new Error(message.payload));
		} else {
			request.resolve(message.payload);
		}
	}

	static request(client: ResponderClient, method: string, payload: unknown[]) {
		const requestId = ++client.#requestId;
		const deferred = new Deferred<unknown>();
		client.#requests.set(requestId, deferred);
		parentPort!.postMessage(staticCast<WorkerMessage>({
			type: 'responderRequest',
			clientId: client.#clientId,
			requestId,
			method,
			payload,
		}));
		return deferred.promise;
	}

	#disconnect() {
		if (this.#disconnected) {
			throw new Error('Already disconnected responder client');
		}
		this.#disconnected = true;
		for (const resolver of this.#requests.values()) {
			resolver.reject(new Error('Disconnected from responder'));
		}
		this.#requests.clear();
		parentPort!.postMessage(staticCast<WorkerMessage>({
			type: 'responderDisconnect',
			clientId: this.#clientId,
		}));
		if (--parentRefs === 0) {
			parentPort!.unref();
		}
	}
}

abstract class ResponderHost<Type extends Responder = any> {
	#refs = 0;
	readonly #instance: Type | Record<string, (...args: unknown[]) => unknown>;
	readonly #name: string;

	constructor(name: string, instance: Type) {
		this.#instance = instance;
		this.#name = name;
	}

	static create<Type extends Responder>(constructor: new(name: string, instance: Type) => ResponderHost<Type>, name: string, instance: Type) {
		const host = new constructor(name, instance);
		const effect = host.#ref();
		return { effect, host };
	}

	static invoke(client: ResponderHost, method: string, payload: unknown[]) {
		return client.#instance[method](...payload);
	}

	static ref(host: ResponderHost) {
		return host.#ref();
	}

	#ref(): Effect {
		let disconnected = false;
		++this.#refs;
		return () => {
			if (disconnected) {
				throw new Error('Already disconnected responder host');
			}
			disconnected = true;
			if (--this.#refs === 0) {
				responderHostsByName.delete(this.#name);
				Responder.release(this.#instance as Type);
			}
		};
	}
}

type WithPromises<Type extends Responder> = {
	[Key in keyof Type]: Type[Key] extends (...args: infer Args) => infer Result | Promise<infer Result> ?
		(...args: Args) => Promise<Result> : never;
};

export type MaybePromises<Type> = {
	[Key in keyof Type]: Type[Key] extends (...args: infer Args) => infer Result | Promise<infer Result> ?
		(...args: Args) => MaybePromise<Result> : never;
};

// Used in host isolate
const responderHostsByClientId = new Map<string, ResponderHost>();
const responderHostsByName = new Map<string, ResponderHost>();

// User in client isolate
let didInitializeWorker = false;
const responderClientsById = new Map<string, ResponderClient>();
const unlistenByClientId = new Map<string, Effect>();

// Connect to an existing responder
let parentRefs = 0;
export async function connect<
	Client extends ResponderClient,
	Host extends ResponderHost<Type>,
	Type extends Responder,
>(
	name: string,
	clientConstructor: new() => Client,
	hostConstructor: new(name: string, instance: Type) => Host,
	create: () => Type | Promise<Type>,
): Promise<[ Effect, Host | Client ]> {
	if (isTopThread) {
		const responder = responderHostsByName.get(name);
		if (responder) {
			// Connecting to a responder from the parent just returns the host object
			const effect = ResponderHost.ref(responder);
			return [ effect, responder as Host ];
		} else {
			// Only one responder per name should exist
			if (responderHostsByName.has(name)) {
				throw new Error(`Responder: ${name} already exists`);
			}
			responderHostsByName.set(name, undefined as never);
			// Instantiate a new Responder
			try {
				const instance = await create();
				const { effect, host } = ResponderHost.create(hostConstructor, name, instance);
				responderHostsByName.set(name, host);
				return [ effect, host as Host ];
			} catch (err) {
				responderHostsByName.delete(name);
				throw err;
			}
		}

	} else {
		// Check with main thread that this responder is ready
		initializeThisWorker();
		if (++parentRefs === 1) {
			parentPort!.ref();
		}
		return new Promise<[ Effect, Client ]>((resolve, reject) => {
			// Set up connection ack handler
			const { client, clientId, effect } = ResponderClient.create(clientConstructor);
			const listener = (message: ParentMessage) => {
				if (message.clientId === clientId) {
					parentPort!.removeListener('message', listener);
					if (message.type === 'responderConnected') {
						responderClientsById.set(clientId, client);
						resolve([ effect, client ]);
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
				clientId,
				name,
			}));
		});
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
				ResponderClient.response(client, message.requestId, message);
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

export function makeClient<Type extends Responder>(constructor: abstract new(...args: any[]) => Type) {

	// Create client wrapper class for this responder
	class Client extends ResponderClient {
		[Method: string]: (...args: unknown[]) => Promise<unknown>;
	}

	// Extend wrapper with request-returning methods
	for (const name of Object.getOwnPropertyNames(constructor.prototype)) {
		const fn = constructor.prototype[name];
		if (name !== 'constructor' && typeof fn === 'function') {
			Client.prototype[name] = function(...args: any[]) {
				return ResponderClient.request(this, name, args);
			};
		}
	}

	// Add in types
	return Client as never as new() => ResponderClient & WithPromises<Type>;
}

export function makeHost<Type extends Responder>(constructor: abstract new(...args: any[]) => Type) {

	// Create host wrapper class for this responder
	class Host extends ResponderHost {
		[Method: string]: (...args: unknown[]) => Promise<unknown>;
	}

	// Extend wrapper with Promise-returning methods
	for (const name of Object.getOwnPropertyNames(constructor.prototype)) {
		const fn = constructor.prototype[name];
		if (name !== 'constructor' && typeof fn === 'function') {
			Host.prototype[name] = function(...args: any[]) {
				return Promise.resolve(ResponderHost.invoke(this, name, args));
			};
		}
	}

	// Add in types
	return Host as never as new(name: string, instance: Type) => ResponderHost & WithPromises<Type>;
}
