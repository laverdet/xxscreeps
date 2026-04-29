import type { MessagePort, Worker } from 'node:worker_threads';
import * as assert from 'node:assert';
import * as fs from 'node:fs/promises';
import * as net from 'node:net';
import { fileURLToPath } from 'node:url';
import * as v8 from 'node:v8';
import { MessageChannel, parentPort } from 'node:worker_threads';
import { Fn } from 'xxscreeps/functional/fn.js';
import { listen, listenEvent } from 'xxscreeps/utility/async.js';
import { Effect } from 'xxscreeps/utility/types.js';

const arrayBufferViews = [
	BigInt64Array,
	BigUint64Array,
	DataView,
	Float32Array,
	Float64Array,
	Int16Array,
	Int32Array,
	Int8Array,
	Uint16Array,
	Uint32Array,
	Uint8Array,
	Uint8ClampedArray,
];

// Running in 'node:vm' will give us array views from different realms, so string comparison on the
// constructor must be used.
const arrayBufferViewNames = arrayBufferViews.map(String);

// Writes a serialized message payload over the socket. `SharedArrayBuffer` instances are copied.
function makeSendMessage(socket: net.Socket) {
	// Non-v8 message frame utility
	const writeUint32 = (value: number) => {
		const array32 = new Uint32Array([ value ]);
		socket.write(new Uint8Array(array32.buffer));
	};

	// v8 serializer. It writes array views as host objects, copying shared array buffers out of band.
	let sharedBufferId = 0;
	const sharedBuffers = new Map<SharedArrayBuffer, number>();
	class Serialize extends v8.Serializer {
		constructor() {
			super();
			// @ts-expect-error
			// eslint-disable-next-line @typescript-eslint/no-unsafe-call
			this._setTreatArrayBufferViewsAsHostObjects(true);
		}

		_writeHostObject(value: object) {
			const index = arrayBufferViewNames.indexOf(String(value.constructor));
			if (index === -1) {
				throw new Error('Unsupported host object type');
			}
			this.writeUint32(index);
			const buffer = (value as ArrayBufferView).buffer;
			if (buffer instanceof ArrayBuffer) {
				this.writeUint32(0);
				this.writeValue(buffer);
			} else {
				this.writeUint32(1);
				this.writeUint32(function() {
					const id = sharedBuffers.get(buffer);
					if (id === undefined) {
						const id = sharedBufferId++;
						sharedBuffers.set(buffer, id);
						return id;
					} else {
						return id;
					}
				}());
			}
		}

		// I was fooled by this old commit, but it was removed before v10.x. It looks like it'll work
		// until you go to deserialize it.
		// https://github.com/nodejs/node/blob/1fde98bb4fa5cab0d060994768ebd055ce6fbf2c/test/parallel/test-v8-serdes-sharedarraybuffer.js
		// _getSharedArrayBufferId(buffer: SharedArrayBuffer);
	}

	// Message framer
	return (value: unknown) => {
		const serializer = new Serialize();
		serializer.writeHeader();
		serializer.writeValue(value);
		writeUint32(sharedBuffers.size);
		for (const buffer of sharedBuffers.keys()) {
			writeUint32(buffer.byteLength);
			socket.write(new Uint8Array(buffer));
		}
		sharedBuffers.clear();
		const buffer = serializer.releaseBuffer();
		writeUint32(buffer.byteLength);
		socket.write(new Uint8Array(buffer));
	};
}

/**
 * Reads a stream serialized by `makeSendMessage`
 *
 * States:
 * [0] uint32 - SharedArrayBuffer count (N)
 * ...N times
 * [1]   uint32 - buffer size (M)
 * [2]   uint8 * M - buffer
 * [3] uint32 - payload size (P)
 * [4] uint8 * P - payload
 */
async function *iterateMessages(socket: AsyncIterable<Buffer>) {
	// Non-v8 message frame utilities
	const buffers: Buffer[] = [];
	const unshiftSize = (size: number) => {
		let length = size;
		while (length > 0) {
			const chunk = buffers[0];
			if (chunk.length <= length) {
				buffers.shift();
				length -= chunk.length;
			} else {
				buffers[0] = chunk.subarray(length);
				break;
			}
		}
	};
	const readUint32 = () => {
		const value = Fn.pipe(
			Fn.concat<number>(buffers),
			$$ => Fn.take($$, 4),
			$$ => new Uint8Array($$),
			$$ => new Uint32Array($$.buffer)[0]);
		unshiftSize(4);
		return value;
	};
	const readBuffer = (buffer: ArrayBuffer | SharedArrayBuffer) => {
		const length = buffer.byteLength;
		const span = new Uint8Array(buffer);
		let ii = 0;
		while (ii < length) {
			const chunk = buffers[0];
			const copyLength = Math.min(chunk.length, length - ii);
			span.set(chunk.subarray(0, copyLength), ii);
			if (copyLength < chunk.length) {
				buffers[0] = chunk.subarray(copyLength);
			} else {
				buffers.shift();
			}
			ii += copyLength;
		}
		return span;
	};

	// v8 serializer. It translates the "host objects" as typed arrays and array buffers.
	class Deserializer extends v8.Deserializer {
		_readHostObject(): unknown {
			type ConstructorType = new (array: ArrayBufferLike) => ArrayBufferView;
			const constructor: ConstructorType | undefined = arrayBufferViews[this.readUint32()];
			if (constructor === undefined) {
				throw new Error('Unsupported host object type');
			}
			const buffer = (() => {
				switch (this.readUint32()) {
					case 0: return this.readValue() as ArrayBuffer;
					case 1: {
						const id = this.readUint32();
						return sharedBuffers.get(id)!;
					}
					default: throw new Error('Invalid host object format');
				}
			})();
			return new constructor(buffer);
		}
	}

	// Message reader state machine
	let state = 0;
	let payloadLength = 0;
	let sharedBufferId = 0;
	let sharedBufferCount = 0;
	let sharedBufferLength = 0;
	const sharedBuffers = new Map<number, SharedArrayBuffer>();
	wait: for await (const chunk of socket) {
		buffers.push(chunk);
		while (buffers.length) {
			const size = Fn.accumulate(buffers, buffer => buffer.length);
			switch (state) {
				case 0: {
					if (size < 4) continue wait;
					const count = readUint32();
					sharedBufferCount += count;
					state = count ? 1 : 3;
					break;
				}

				case 1:
					if (size < 4) continue wait;
					sharedBufferLength = readUint32();
					state = 2;
					break;

				case 2: {
					if (size < sharedBufferLength) continue wait;
					const buffer = new SharedArrayBuffer(sharedBufferLength);
					sharedBuffers.set(sharedBufferId++, buffer);
					readBuffer(buffer);
					state = sharedBufferId === sharedBufferCount ? 3 : 1;
					break;
				}

				case 3:
					if (size < 4) continue wait;
					payloadLength = readUint32();
					state = 4;
					break;

				case 4: {
					if (size < payloadLength) continue wait;
					const payload = readBuffer(new ArrayBuffer(payloadLength));
					const deserializer = new Deserializer(new Uint8Array(payload));
					deserializer.readHeader();

					for (const [ id, buffer ] of sharedBuffers) {
						// @ts-expect-error -- yikes
						deserializer.transferArrayBuffer(id, buffer);
					}
					yield deserializer.readValue();
					sharedBuffers.clear();
					state = 0;
					break;
				}

				default: throw new Error('Invalid state');
			}
		}
	}
}

/** @internal */
export interface LocalPayloadPort<Send, Receive> {
	messages: AsyncIterable<Receive>;
	send: (this: void, message: Send) => void;
}

/** @internal */
export interface DisposableLocalPayloadPort<Send, Receive> extends LocalPayloadPort<Send, Receive>, AsyncDisposable {}

/**
 * Serialized payload listener over sockets.
 * @internal
 */
export async function makeSocketPortListener<Send, Receive>(
	url: URL,
	handler: (port: LocalPayloadPort<Send, Receive>) => void,
): Promise<AsyncDisposable> {
	await using disposable = new AsyncDisposableStack();

	// Create server and listen
	const server = net.createServer();
	await async function() {
		using disposeListen = new DisposableStack();
		const path = fileURLToPath(url);
		try {
			await fs.unlink(path);
		} catch {}
		await new Promise<void>((resolve, reject) => {
			disposeListen.defer(listen(server, 'error', reject));
			disposeListen.defer(listen(server, 'listening', resolve));
			server.listen(fileURLToPath(url));
		});
	}();
	disposable.use(server);

	// Watch for connections
	const signal = disposable.adopt(new AbortController(), controller => controller.abort()).signal;
	server.on('connection', socket => {
		const unlisten = listenEvent(signal, 'abort', () => socket.end());
		socket.on('close', unlisten);
		handler({
			messages: iterateMessages(socket),
			send: makeSendMessage(socket),
		});
	});
	return disposable.move();
}

/**
 * Serialized payload connector over sockets.
 * @internal
 */
export async function makeSocketPortConnection<Send, Receive>(url: URL): Promise<DisposableLocalPayloadPort<Send, Receive>> {
	await using disposable = new AsyncDisposableStack();

	// Connect to server
	const connection = net.connect(fileURLToPath(url));
	await async function() {
		using disposeConnect = new DisposableStack();
		await new Promise<void>((resolve, reject) => {
			disposeConnect.defer(listen(connection, 'error', reject));
			disposeConnect.defer(listen(connection, 'connect', resolve));
		});
	}();
	disposable.use(connection);

	// Make the port
	const send = makeSendMessage(connection);
	return {
		messages: iterateMessages(connection),
		send: message => {
			if (connection.writable) {
				send(message);
			} else {
				throw new Error('Connection closed');
			}
		},
		[Symbol.asyncDispose]: function(dispose) {
			return async () => {
				await using _dispose = dispose;
				connection.end();
				await new Promise<void>((resolve, reject) => {
					connection.on('error', reject);
					connection.on('close', resolve);
				});
			};
		}(disposable.move()),
	};
}

/** @internal */
export interface UnknownMessage { type: null }
/** @internal */
export interface WorkerConnectMessage {
	type: 'workerConnect';
	name: string;
	port: MessagePort;
}
interface WorkerConnectedMessage {
	type: 'workerConnected';
}

// Iterates messages from a MessagePort
async function *messagePortToIterable<Message>(port: MessagePort): AsyncIterable<Message> {
	using disposable = new DisposableStack();
	disposable.defer(() => port.close());
	let deferred = Promise.withResolvers<boolean>();
	let queue: Message[] = [];
	port.on('close', () => { deferred.resolve(false); });
	port.on('error', error => deferred.reject(error));
	port.on('message', (message: Message) => {
		queue.push(message);
		deferred.resolve(true);
		deferred = Promise.withResolvers();
	});
	while (await deferred.promise) {
		const next = queue;
		queue = [];
		yield* next;
	}
}

// Batches same-tick messages into an array
function batchMessagePortSend<Message>(port: MessagePort) {
	let queue: Message[] = [];
	return (send: Message) => {
		if (queue.length === 0) {
			process.nextTick(() => {
				port.postMessage(queue);
				queue = [];
			});
		}
		queue.push(send);
	};
}

/**
 * Listen for worker messages and forward to given handler, as if it were a socket.
 * @internal
 */
export function makeWorkerPortListener<Send, Receive>(
	worker: Worker,
	handler: (name: string) => ((port: LocalPayloadPort<Send, Receive>) => void) | undefined,
): Effect {
	type WorkerReceive = UnknownMessage | WorkerConnectMessage;
	return listen(worker, 'message', (message: WorkerReceive | UnknownMessage) => {
		if (message.type === 'workerConnect') {
			const portHandler = handler(message.name);
			if (portHandler) {
				// Raise "connection" event
				const { port } = message;
				port.postMessage({ type: 'workerConnected' } satisfies WorkerConnectedMessage);
				portHandler({
					messages: Fn.transformAsync(messagePortToIterable<Receive[]>(port), Fn.identity),
					send: batchMessagePortSend(port),
				});
			}
		}
	});
}

/**
 * Connect to a named worker message port.
 * @internal
 */
export async function makeWorkerPortConnection<Send, Receive>(name: string): Promise<DisposableLocalPayloadPort<Send, Receive>> {
	assert.ok(parentPort);
	const { port1, port2 } = new MessageChannel();
	parentPort.postMessage({
		type: 'workerConnect',
		name,
		port: port2,
	} satisfies WorkerConnectMessage, [ port2 ]);
	const shift = await Fn.shiftAsync(messagePortToIterable<Receive[] | WorkerConnectedMessage>(port1));
	const messages = function() {
		if (shift.head) {
			const message = shift.head as WorkerConnectedMessage | UnknownMessage;
			if (message.type === 'workerConnected') {
				return shift.rest;
			}
		}
	}();
	if (messages) {
		return {
			// eslint-disable-next-line @typescript-eslint/require-await
			async [Symbol.asyncDispose]() {
				port1.close();
			},
			messages: Fn.transformAsync(messages as AsyncIterable<Receive[]>, Fn.identity),
			send: batchMessagePortSend(port1),
		};
	} else {
		await shift.rest?.[Symbol.asyncIterator]().return?.();
		throw new Error(`Failed to connect to worker port ${name}.`);
	}
}
