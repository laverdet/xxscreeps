import type { Effect, MaybePromise } from 'xxscreeps/utility/types';
import type { MessagePort, Worker } from 'worker_threads';
import { MessageChannel, parentPort } from 'worker_threads';
import { Deferred, listen } from 'xxscreeps/utility/async';
import { staticCast } from 'xxscreeps/utility/utility';
import { isTopThread } from 'xxscreeps/utility/worker';

/**
 * Responders generalizes the client/server request/response model for inter-thread/process
 * communication.
 */
type UnknownMessage = { type: null };
type ConnectMessage = {
	type: 'responderConnect';
	name: string;
	port: MessagePort;
};
type ConnectedMessage = {
	type: 'responderConnected';
};
type RequestMessage = {
	requestId: number;
	method: string;
	payload: unknown[];
};
type ResponseMessage = {
	requestId: number;
} & ({
	payload: unknown;
	rejection?: false;
} | {
	payload: string;
	rejection: true;
});

// Used in host isolate
const responderHostsByName = new Map<string, { effect: Effect; host: ResponderHost }>();

abstract class ResponderClient {
	#disconnected = false;
	#queue: RequestMessage[] = [];
	#requestId = 0;
	readonly #channel = new MessageChannel;
	readonly #port = this.#channel.port1;
	readonly #requests = new Map<number, Deferred<any>>();

	static async connect<Type extends ResponderClient>(constructor: new() => Type, name: string) {
		// Instantiate client & port
		const client = new constructor;
		const effect: Effect = () => client.#disconnect();
		const port = client.#channel.port2;

		// Connect to responder
		const result = await new Promise<[ Effect, Type ]>((resolve, reject) => {
			// Set up connection ack handler
			client.#port.once('message', (message: ConnectedMessage | UnknownMessage) => {
				if (message.type === 'responderConnected') {
					closeEffect();
					resolve([ effect, client ]);
				} else {
					reject(new Error(`Responder ${name} sent weird ack`));
				}
			});

			// Failure handler
			const closeEffect = listen(client.#port, 'close', () =>
				reject(new Error(`Responder ${name} does not exist`)));

			// Send "connection" request to main thread
			parentPort!.postMessage(staticCast<ConnectMessage>({
				type: 'responderConnect',
				name,
				port,
			}), [ port ]);
		});

		// Add listener for responses from host
		client.#port.on('message', (messages: ResponseMessage[]) => {
			for (const message of messages) {
				const { requestId } = message;
				const request = client.#requests.get(requestId)!;
				client.#requests.delete(requestId);
				if (message.rejection) {
					request.reject(new Error(message.payload));
				} else {
					request.resolve(message.payload);
				}
			}
		});

		return result;
	}

	static request(client: ResponderClient, method: string, payload: unknown[]) {
		if (client.#disconnected) {
			return Promise.reject(new Error('Disconnected from responder'));
		}
		const requestId = ++client.#requestId;
		const deferred = new Deferred<unknown>();
		client.#requests.set(requestId, deferred);
		if (client.#queue.length === 0) {
			process.nextTick(() => {
				client.#port.postMessage(client.#queue);
				client.#queue = [];
			});
		}
		client.#queue.push({
			requestId,
			method,
			payload,
		});
		return deferred.promise;
	}

	#disconnect() {
		if (this.#disconnected) {
			throw new Error('Already disconnected responder client');
		}
		this.#disconnected = true;
		this.#requests.clear();
		this.#port.close();
	}
}

abstract class ResponderHost<Type = any> {
	#refs = 0;
	readonly #instance: Type | Record<string, (...args: unknown[]) => unknown>;
	readonly #name: string;

	constructor(name: string, instance: Type) {
		this.#instance = instance;
		this.#name = name;
	}

	static connect(host: ResponderHost, port: MessagePort) {
		let queue: ResponseMessage[] = [];
		const instance = host.#instance;
		const respond = (message: ResponseMessage) => {
			if (queue.length === 0) {
				process.nextTick(() => {
					port.postMessage(queue);
					queue = [];
				});
			}
			queue.push(message);
		};
		port.on('close', host.#ref());
		port.on('message', (messages: RequestMessage[]) => {
			for (const message of messages) {
				const { method, payload, requestId } = message;
				(async function() {
					respond({
						requestId,
						payload: await instance[method](...payload),
					});
				})().catch(err => respond({
					requestId,
					payload: err.stack,
					rejection: true,
				}));
			}
		});
	}

	static invoke(host: ResponderHost, method: string, payload: unknown[]) {
		return host.#instance[method](...payload);
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
				const { effect } = responderHostsByName.get(this.#name)!;
				responderHostsByName.delete(this.#name);
				effect();
			}
		};
	}
}

type WithPromises<Type> = {
	[Key in keyof Type]: Type[Key] extends (...args: infer Args) => MaybePromise<infer Result> ?
		(...args: Args) => Promise<Result> : never;
};

export type MaybePromises<Type> = {
	[Key in keyof Type]: Type[Key] extends (...args: infer Args) => MaybePromise<infer Result> ?
		(...args: Args) => MaybePromise<Result> : never;
};

// Connect to an existing responder
export async function connect<
	Client extends ResponderClient,
	Host extends ResponderHost<Type>,
	Type,
>(
	name: string,
	clientConstructor: new() => Client,
	hostConstructor: new(name: string, instance: Type) => Host,
	create: () => MaybePromise<readonly [ Effect, Type ]>,
): Promise<[ Effect, Host | Client ]> {
	if (isTopThread) {
		const responder = responderHostsByName.get(name);
		if (responder) {
			// Connecting to a responder from the parent just returns the host object
			const effect = ResponderHost.ref(responder.host);
			return [ effect, responder.host as Host ];
		} else {
			// Only one responder per name should exist
			if (responderHostsByName.has(name)) {
				throw new Error(`Responder: ${name} already exists`);
			}
			responderHostsByName.set(name, undefined as never);
			// Instantiate a new Responder
			try {
				const [ effect, instance ] = await create();
				const host = new hostConstructor(name, instance);
				responderHostsByName.set(name, { effect, host });
				return [ ResponderHost.ref(host), host ];
			} catch (err) {
				responderHostsByName.delete(name);
				throw err;
			}
		}

	} else {
		// Attempt to connect as a client
		return ResponderClient.connect(clientConstructor, name);
	}
}

// Called on the parent thread, once per worker created
export function initializeWorker(worker: Worker) {
	if (isTopThread) {
		worker.on('message', (message: ConnectMessage | UnknownMessage) => {
			if (message.type === 'responderConnect') {
				// Child worker is connecting to parent
				const responder = responderHostsByName.get(message.name);
				const { port } = message;
				if (responder) {
					// Connect to responder
					ResponderHost.connect(responder.host, port);
					port.postMessage(staticCast<ConnectedMessage>({
						type: 'responderConnected',
					}));
				} else {
					// Doesn't exist
					port.close();
				}
			}
		});
	} else {
		worker.on('message', (message: ConnectMessage | UnknownMessage) => {
			// Forward message up to top thread
			if (message.type === 'responderConnect') {
				parentPort!.postMessage(message, [ message.port ]);
			}
		});
	}
}

export function makeClient<Type>(constructor: abstract new(...args: any[]) => Type) {

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

export function makeHost<Type>(constructor: abstract new(...args: any[]) => Type) {

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
