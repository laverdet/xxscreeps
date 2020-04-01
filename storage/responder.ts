import assert from 'assert';
import { Worker, isMainThread, parentPort } from 'worker_threads';
import { staticCast } from '~/lib/utility';

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

type UnknownMessage = { type: null };
type ParentMessage = ResponseMessage | ConnectedMessage | ConnectionFailedMessage | UnknownMessage;
type WorkerMessage = RequestMessage | ConnectMessage | DisconnectMessage | UnknownMessage;

type AbstractResponderHost = Responder & { _refs: number };
type AbstractResponderClient = Responder & { _clientId: string; _requests: Map<number, Resolver> };

// Used in host isolate
const responderHostsByClientId = new Map<string, Responder>();
const responderHostsByName = new Map<string, AbstractResponderHost>();

// User in client isolate
let didInitializeWorker = false;
const responderClientsById = new Map<string, Responder>();
const unlistenByClientId = new Map<string, () => void>();

// Connect to an existing responder
export function connect<Host extends AbstractResponderHost, Client extends AbstractResponderClient>(
	name: string,
	clientConstructor: Constructor<Client>,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	hostConstructor: Constructor<Host>,
): Promise<Client | Host> {
	if (isMainThread) {
		// Connecting to a responder from the parent just returnse
		const responder = responderHostsByName.get(name) as Host | undefined;
		if (responder) {
			++responder._refs;
			return Promise.resolve(responder);
		} else {
			return Promise.reject(new Error(`Responder: ${name} does not exist`));
		}

	} else {
		// Check with main thread that this responder is ready
		initializeThisWorker();
		return new Promise<Client>((resolve, reject) => {
			// Set up connection ack handler
			const responder = new clientConstructor as Client;
			const listener = (message: ParentMessage) => {
				if ((message as any).clientId === responder._clientId) {
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
export function create<Host extends AbstractResponderHost, Args>(
	name: string,
	hostConstructor: new(name: string, ...args: Args[]) => Host,
	...args: Args[]
) {
	assert(isMainThread);
	// Only one responder per name should exist
	if (responderHostsByName.has(name)) {
		throw new Error(`Responder: ${name} already exists`);
	}
	responderHostsByName.set(name, undefined as any);
	// Instantiate a new Responder
	try {
		const instance = new hostConstructor(name, ...args);
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
				const { _requests } = client as AbstractResponderClient;
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
				const host = responderHostsByClientId.get(clientId)!;
				const request = host === undefined ?
					Promise.reject(new Error('Responder has gone away')) :
					host.request(method, payload);
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

export abstract class Responder {
	disconnect() {}
	abstract request(method: string, payload?: any): Promise<any>;
}

export const ResponderHost = <Type extends Responder, Args>(baseClass: new(...args: Args[]) => Type):
new(...args: Args[]) => Type & Responder & AbstractResponderHost =>
	class extends (baseClass as any) {
		_refs = 1;

		constructor(private readonly _name: string, ...args: Args[]) {
			// eslint-disable-next-line constructor-super
			super(...args);
		}

		disconnect() {
			if (--this._refs === 0) {
				responderHostsByName.delete(this._name);
			}
			super.disconnect();
		}
	} as any;

export const ResponderClient = <Type, Args>(baseClass: new(...args: Args[]) => Type):
new(...args: Args[]) => Type & Responder & AbstractResponderClient =>
	class extends (baseClass as any) {
		private _requestId = 0;
		readonly _clientId = `${Math.floor(Math.random() * 2 ** 52)}`;
		readonly _requests = new Map<number, Resolver>();

		disconnect() {
			for (const resolver of this._requests.values()) {
				resolver.reject(new Error('Disconnected from responder'));
			}
			this._requests.clear();
			parentPort!.postMessage(staticCast<WorkerMessage>({
				type: 'responderDisconnect',
				clientId: this._clientId,
			}));
		}

		request(method: string, payload?: any) {
			return new Promise((resolve, reject) => {
				const requestId = ++this._requestId;
				this._requests.set(requestId, { resolve, reject });
				parentPort!.postMessage(staticCast<WorkerMessage>({
					type: 'responderRequest',
					clientId: this._clientId,
					requestId,
					method,
					payload,
				}));
			});
		}
	} as any;
