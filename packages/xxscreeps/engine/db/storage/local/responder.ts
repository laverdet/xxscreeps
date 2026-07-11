import type { LocalPayloadPort, UnknownMessage, WorkerConnectMessage } from './port.js';
import type { Worker } from 'node:worker_threads';
import type { MaybePromise } from 'xxscreeps/utility/types.js';
import { parentPort } from 'node:worker_threads';
import { config, configPath } from 'xxscreeps/config/index.js';
import { isTopThread } from 'xxscreeps/engine/service/index.js';
import { Fn } from 'xxscreeps/functional/fn.js';
import { mustNotReject } from 'xxscreeps/utility/async.js';
import { FileSystemLock } from 'xxscreeps/utility/file-lock.js';
import { runOnce } from 'xxscreeps/utility/memoize.js';
import { disposableToEffect } from 'xxscreeps/utility/utility.js';
import { makeSocketPortConnection, makeSocketPortListener, makeWorkerPortConnection, makeWorkerPortListener } from './port.js';

/**
 * "Sibling process" is a process running on the same machine, but which did not acquire a responder
 * lock.
 */
export const isSiblingProcess = runOnce(async () => {
	if (isTopThread) {
		const { lock } = config.database;
		// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
		if (lock == null) {
			return false;
		} else {
			try {
				const path = new URL(lock, configPath);
				process.on('exit', disposableToEffect(await FileSystemLock.acquire(path)));
				return false;
			} catch {
				return true;
			}
		}
	} else {
		return false;
	}
});

/** @internal */
export function getResponderSocketPath(url: URL) {
	const socket = url.searchParams.get('socket');
	if (socket !== null) {
		if (url.protocol === 'local:') {
			return new URL(socket, configPath);
		} else {
			return new URL(socket, url);
		}
	}
}

/**
 * Responders generalizes the client/server request/response model for inter-thread/process
 * communication.
 */
interface RequestMessage {
	requestId: number;
	method: string;
	payload: unknown[];
}
interface ResponseCompletionMessage {
	requestId: number;
}
interface ResponseResolveMessage extends ResponseCompletionMessage {
	payload: unknown;
	rejection?: false;
}
interface ResponseRejectMessage extends ResponseCompletionMessage {
	payload: string;
	rejection: true;
}

type ResponseMessage = ResponseResolveMessage | ResponseRejectMessage;

// eslint-disable-next-line @typescript-eslint/consistent-indexed-object-style
interface ResponderImplementation extends SharedResponder {
	[Method: string]: (...args: unknown[]) => MaybePromise<unknown>;
}

type SocketResponderSend = (message: RequestMessage) => void;

export abstract class SharedResponder implements AsyncDisposable {
	#refs = 0;

	static ref<Type extends SharedResponder>(instance: Type) {
		++instance.#refs;
		return instance;
	}

	async [Symbol.asyncDispose]() {
		const refs = --this.#refs;
		if (refs === 0) {
			await this.disposeAsync();
		} else if (refs < 0) {
			throw new Error(`${this.constructor.name}: disposed too many times`);
		}
	}

	protected abstract disposeAsync(): Promise<void>;
}

// Used in host isolate
const responderHostsByName = new Map<string, ResponderHost>();

abstract class ResponderClient implements AsyncDisposable {
	readonly #disposable;
	#disconnected = false;
	#requestId = 0;
	readonly #send;
	readonly #requests = new Map<number, PromiseWithResolvers<unknown>>();

	constructor(disposable: AsyncDisposable, send: SocketResponderSend) {
		this.#disposable = disposable;
		this.#send = send;
	}

	static async connect<Type extends ResponderClient>(constructor: new(disposable: AsyncDisposable, send: SocketResponderSend) => Type, url: URL) {
		// Connect to port by socket or worker request
		await using disposable = new AsyncDisposableStack();
		const port = await function() {
			if (isTopThread) {
				const path = getResponderSocketPath(url);
				if (!path) {
					throw new Error('No responder configured');
				}
				return makeSocketPortConnection<RequestMessage, ResponseMessage>(path);
			} else {
				return makeWorkerPortConnection<RequestMessage, ResponseMessage>(`${url}`);
			}
		}();
		disposable.use(port);

		// Forward requests to port
		const client = new constructor(disposable.move(), port.send);
		mustNotReject(async function() {
			for await (const message of port.messages) {
				const { requestId } = message;
				const request = client.#requests.get(requestId)!;
				client.#requests.delete(requestId);
				if (message.rejection) {
					request.reject(new Error(message.payload));
				} else {
					request.resolve(message.payload);
				}
			}
		}());

		// Return effect and client
		return client;
	}

	static request(client: ResponderClient, method: string, payload: unknown[]) {
		if (client.#disconnected) {
			return Promise.reject(new Error('Disconnected from responder'));
		}
		const requestId = ++client.#requestId;
		const deferred = Promise.withResolvers();
		client.#requests.set(requestId, deferred);
		client.#send({ requestId, method, payload });
		return deferred.promise;
	}

	async [Symbol.asyncDispose]() {
		await this.#disposable[Symbol.asyncDispose]();
		if (this.#disconnected) {
			throw new Error('Already disconnected responder client');
		}
		this.#disconnected = true;
		const error = new Error('Disconnected from responder');
		for (const deferred of this.#requests.values()) {
			deferred.reject(error);
			deferred.promise.catch(() => {});
		}
		this.#requests.clear();
	}
}

abstract class ResponderHost<Type extends ResponderImplementation = ResponderImplementation> extends SharedResponder {
	readonly #disposable = new AsyncDisposableStack();
	readonly #instance: Type;
	readonly #name: string;

	constructor(name: string, instance: Type, maybeServer: AsyncDisposable | undefined) {
		super();
		this.#instance = instance;
		this.#name = name;
		this.#disposable.use(instance);
		this.#disposable.use(maybeServer);
	}

	static connect(host: ResponderHost, port: LocalPayloadPort<ResponseMessage, RequestMessage>) {
		const instance = host.#instance;
		mustNotReject(async function() {
			// TODO: I want a version of `Fn.distribute` with unlimited throughput bound by the receiver's
			// speed.
			const responses = Fn.distribute(port.messages, 16, async function*(messages): AsyncIterable<ResponseMessage> {
				for await (const message of messages) {
					const { method, payload, requestId } = message;
					try {
						yield {
							requestId,
							payload: await instance[method]!(...payload),
						};
					} catch (error: any) {
						yield {
							requestId,
							// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
							payload: error.stack,
							rejection: true,
						};
					}
				}
			});
			for await (const response of responses) {
				port.send(response);
			}
		}());
	}

	static invoke(host: ResponderHost, method: string, payload: unknown[]) {
		return host.#instance[method]!(...payload);
	}

	protected async disposeAsync() {
		responderHostsByName.delete(this.#name);
		await this.#disposable.disposeAsync();
	}
}

type WithPromises<Type> = {
	[Key in Exclude<keyof Type, symbol | 'disposeAsync'>]:
	Type[Key] extends (...args: infer Args) => MaybePromise<infer Result>
		? (...args: Args) => Promise<Result>
		: never;
};

export type MaybePromises<Type> = {
	[Key in keyof Type]: Type[Key] extends (...args: infer Args) => MaybePromise<infer Result>
		? (...args: Args) => MaybePromise<Result> : never;
};

// Connect to an existing responder
export async function connect<
	Client extends ResponderClient,
	Host extends ResponderHost,
	Type extends AsyncDisposable,
>(
	url: URL,
	clientConstructor: new() => Client,
	hostConstructor: new(name: string, instance: Type, maybeServer: AsyncDisposable | undefined) => Host,
	create: () => MaybePromise<Type>,
): Promise<Client | Host> {
	const name = `${url}`;
	if (isTopThread && !await isSiblingProcess()) {
		const responder = responderHostsByName.get(name);
		if (responder) {
			// Connecting to a responder from the parent just returns the host object
			return SharedResponder.ref(responder) satisfies ResponderHost as Host;
		} else {
			// Only one responder per name should exist
			if (responderHostsByName.has(name)) {
				throw new Error(`Responder: ${name} already exists`);
			}
			responderHostsByName.set(name, undefined as never);
			// Instantiate a new Responder
			try {
				const maybeServer = await function() {
					const socketPath = getResponderSocketPath(url);
					if (socketPath) {
						return makeSocketPortListener<ResponseMessage, RequestMessage>(socketPath, port => ResponderHost.connect(host, port));
					}
				}();
				const instance = await create();
				const host = new hostConstructor(name, instance, maybeServer);
				responderHostsByName.set(name, host);
				return SharedResponder.ref(host);
			} catch (error) {
				responderHostsByName.delete(name);
				throw error;
			}
		}
	} else {
		// Attempt to connect as a socket or worker client
		return ResponderClient.connect(clientConstructor, url);
	}
}

// Called on the parent thread, once per worker created
export function initializeWorker(worker: Worker) {
	if (isTopThread) {
		// Respond to worker requests
		makeWorkerPortListener(worker, name => {
			const responder = responderHostsByName.get(name);
			if (responder) {
				return port => ResponderHost.connect(responder, port as LocalPayloadPort<ResponseMessage, RequestMessage>);
			}
		});
	} else {
		// Forward connection requests up to top thread
		// nb: This also passes connections for `pubsub`
		worker.on('message', (message: WorkerConnectMessage | UnknownMessage) => {
			if (message.type === 'workerConnect') {
				parentPort!.postMessage(message, [ message.port ]);
			}
		});
	}
}

function applyResponderMethods(
	constructorFrom: { prototype: any },
	constructorTo: { prototype: any },
	make: (name: string) => unknown,
) {
	for (const name of Object.getOwnPropertyNames(constructorFrom.prototype)) {
		// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
		const fn = constructorFrom.prototype[name];
		if (name !== 'constructor' && typeof fn === 'function') {
			// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
			constructorTo.prototype[name] = make(name);
		}
	}
}

/** @internal */
export function makeClient<Type extends AsyncDisposable>(constructor: { prototype: Type }) {

	// Create client wrapper class for this responder
	class Client extends ResponderClient {
		[Method: string]: (...args: unknown[]) => Promise<unknown>;
	}
	applyResponderMethods(constructor, Client, name => function(this: Client, ...args: any[]) {
		return ResponderClient.request(this, name, args);
	});

	// Add in types
	return Client as unknown as new() => ResponderClient & WithPromises<Type>;
}

/** @internal */
export function makeHost<Type>(constructor: { prototype: Type }) {

	// Create host wrapper class for this responder
	class Host extends ResponderHost {
		[Method: string]: (...args: unknown[]) => Promise<unknown>;
	}
	applyResponderMethods(constructor, Host, name => function(this: Host, ...args: any[]) {
		return Promise.resolve(ResponderHost.invoke(this, name, args));
	});

	// Add in types
	return Host as unknown as new(name: string, instance: Type) => ResponderHost & WithPromises<Type>;
}
