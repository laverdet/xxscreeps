import assert from 'assert';
import { Worker, isMainThread, parentPort } from 'worker_threads';
import { staticCast } from '~/lib/utility';

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

/**
 * Generalize the client/server request/response model for inter-thread/process communication. The
 * types in this class are a mess but at least it's contained to this file and doesn't leak out into
 * the rest of the project.
 */
const instancesByName = new Map<string, any>();
const respondersByName = new Map<string, Responder>();
const respondersByClientId = new Map<string, Responder>();
const unlistenByClientId = new Map<string, () => void>();
type HasResponder = {
	request(method: string, payload?: any): Promise<any>;
};
export abstract class Responder {
	abstract disconnect(): void;
	abstract request(method: string, payload?: any): Promise<any>;

	static connect<Host extends HasResponder, Client extends HasResponder>(
		name: string,
		constructor: new() => Client,
	): Promise<Responder & (Client | Host)> {
		if (isMainThread) {
			return ResponderHost.hostConnect<Host>(name) as any;
		} else {
			return ResponderClient.clientConnect(name, constructor) as any;
		}
	}

	static async create<Type extends HasResponder>(name: string, factory: () => Promise<Type>):
			Promise<Type & Responder> {
		assert(isMainThread);
		// Only one responder per name should exist
		if (respondersByName.has(name)) {
			return Promise.reject(new Error(`Responder: ${name} already exists`));
		}
		// Instantiate a new ResponderHost instance.. violates `abstract`!
		const responder = new (ResponderHost as any)(name) as ResponderHost;
		const instance = await factory();
		instancesByName.set(name, instance);
		// Link up methods from both classes
		(instance as any).disconnect = responder.disconnect.bind(responder);
		responder.request = instance.request.bind(instance);
		return Promise.resolve(instance as any);
	}

	static initializeWorker(worker: Worker) {
		worker.on('message', (message: WorkerMessage) => {
			switch (message.type) {
				// Child worker is connecting to parent
				case 'responderConnect': {
					// Check that this responder exists
					const responder = respondersByName.get(message.name);
					const { clientId } = message;
					if (responder === undefined) {
						worker.postMessage(staticCast<ParentMessage>({
							type: 'responderConnectionFailed',
							clientId,
						}));
					} else {
						// Save parent by client id for responses
						respondersByClientId.set(clientId, responder);
						worker.postMessage(staticCast<ParentMessage>({
							type: 'responderConnected',
							clientId,
						}));
						// Sudden disconnect listener
						const exitListener = () => respondersByClientId.delete(clientId);
						worker.on('exit', exitListener);
						unlistenByClientId.set(clientId, () => worker.removeListener('exit', exitListener));
					}
					break;
				}

				// Child worker is disconnecting
				case 'responderDisconnect': {
					const { clientId } = message;
					respondersByClientId.delete(clientId);
					unlistenByClientId.get(clientId)!();
					unlistenByClientId.delete(clientId);
					break;
				}

				// Incoming request from child
				case 'responderRequest': {
					const { clientId, requestId } = message;
					const server = respondersByClientId.get(clientId)!;
					const request = server === undefined ?
						Promise.reject(new Error('Responder has gone away')) :
						server.request(message.method, message.payload);
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
}

export abstract class ResponderHost extends Responder {
	refs = 1;
	constructor(protected name: string) {
		super();
		assert(isMainThread);
		if (respondersByName.has(name)) {
			throw new Error(`Responder: ${name} already exists`);
		}
		respondersByName.set(name, this);
	}

	static hostConnect<Type extends HasResponder>(name: string): Promise<Type> {
		const responder = respondersByName.get(name) as any;
		if (responder === undefined) {
			return Promise.reject(new Error(`Responder: ${name} does not exist`));
		} else {
			++responder.refs;
			const instance = instancesByName.get(name);
			return Promise.resolve(instance);
		}
	}

	disconnect() {
		if (--this.refs === 0) {
			respondersByName.delete(this.name);
			instancesByName.delete(this.name);
		}
	}
}

export class ResponderClient extends Responder {
	private readonly clientId = `${Math.floor(Math.random() * 2 ** 52)}`;
	private requestId = 0;
	private readonly requests = new Map<number, Resolver>();

	// Single listener for all clients in a worker
	static didInit = false;
	private static init() {
		if (this.didInit) {
			return;
		}
		this.didInit = true;
		parentPort!.on('message', (message: ParentMessage) => {
			if (message.type === 'responderResponse') {
				const client = respondersByClientId.get(message.clientId);
				if (client !== undefined) {
					const { requests } = client as ResponderClient;
					const request = requests.get(message.requestId);
					requests.delete(message.requestId);
					if (message.rejection === true) {
						request?.reject(new Error(message.payload));
					} else {
						request?.resolve(message.payload);
					}
				}
			}
		});
	}

	constructor() {
		super();
		ResponderClient.init();
		respondersByClientId.set(this.clientId, this as Responder);
	}

	static clientConnect<Type extends HasResponder>(name: string, constructor: new() => Type) {

		// Check with main thread that this responder is ready (no retries)
		assert(!isMainThread);
		return new Promise<Type>((resolve, reject) => {
			// Set up connection ack handler
			const responder = new ResponderClient;
			const listener = (message: ParentMessage) => {
				if ((message as any).clientId === responder.clientId) {
					parentPort!.removeListener('message', listener);
					if (message.type === 'responderConnected') {
						const instance = new constructor;
						(instance as any).disconnect = responder.disconnect.bind(responder);
						instance.request = responder.request.bind(responder);
						resolve(instance);
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
				clientId: responder.clientId,
				name,
			}));
		});
	}

	disconnect() {
		for (const resolver of this.requests.values()) {
			resolver.reject(new Error('Disconnected from responder'));
		}
		this.requests.clear();
		parentPort!.postMessage(staticCast<WorkerMessage>({
			type: 'responderDisconnect',
			clientId: this.clientId,
		}));
	}

	request(method: string, payload?: any) {
		return new Promise((resolve, reject) => {
			const requestId = ++this.requestId;
			this.requests.set(requestId, { resolve, reject });
			parentPort!.postMessage(staticCast<WorkerMessage>({
				type: 'responderRequest',
				clientId: this.clientId,
				requestId,
				method,
				payload,
			}));
		});
	}
}
