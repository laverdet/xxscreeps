import crypto from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const maxBufferSize = 1 << 20;

export interface LauncherRpcRequest {
	readonly expression: string;
}

export interface LauncherRpcResponse {
	readonly ok: boolean;
	readonly stdout: string;
	readonly stderr: string;
	readonly output: string;
}

export function socketPathFor(configUrl: URL): string {
	if (process.platform === 'win32') {
		return `\\\\.\\pipe\\xxscreeps-${crypto.createHash('md5').update(configUrl.href).digest('hex').slice(0, 8)}`;
	}
	return fileURLToPath(new URL('screeps/cli.sock', configUrl));
}

export async function probeSocketPath(socketPath: string): Promise<'available' | 'in-use'> {
	if (process.platform === 'win32') return 'available';
	const decided = Promise.withResolvers<'available' | 'in-use'>();
	const probe = net.connect({ path: socketPath }, () => {
		probe.destroy();
		decided.resolve('in-use');
	});
	probe.on('error', (err: NodeJS.ErrnoException) => {
		if (err.code === 'ENOENT') {
			decided.resolve('available');
		} else if (err.code === 'ECONNREFUSED' || err.code === 'ENOTSOCK') {
			try {
				fs.unlinkSync(socketPath);
			} catch (unlinkErr) {
				decided.reject(unlinkErr instanceof Error ? unlinkErr : new Error(String(unlinkErr)));
				return;
			}
			decided.resolve('available');
		} else {
			decided.reject(err);
		}
	});
	return decided.promise;
}

type RequestHandler = (request: LauncherRpcRequest) => Promise<LauncherRpcResponse>;

function findNewline(chunks: readonly Buffer[]): { chunkIndex: number; offset: number } | undefined {
	for (let index = 0; index < chunks.length; index++) {
		const offset = chunks[index]!.indexOf(0x0a);
		if (offset !== -1) return { chunkIndex: index, offset };
	}
	return undefined;
}

function takeLine(chunks: Buffer[], chunkIndex: number, offset: number): string {
	const prefix = chunks.slice(0, chunkIndex);
	prefix.push(chunks[chunkIndex]!.subarray(0, offset));
	return Buffer.concat(prefix).toString('utf8');
}

export async function listenLauncherRpc(
	socketPath: string,
	setupConnection: () => (request: LauncherRpcRequest) => Promise<LauncherRpcResponse>,
): Promise<{ close: () => Promise<void> }> {
	if (process.platform !== 'win32') {
		// Birth the parent dir at 0o700 to avoid a window where it's reachable to other UIDs.
		await fs.promises.mkdir(path.dirname(socketPath), { mode: 0o700, recursive: true });
	}
	const connections = new Set<net.Socket>();
	const pending = new Set<Promise<void>>();
	let dataEpoch = 0;
	const server = net.createServer(socket => {
		connections.add(socket);
		const handle = setupConnection();
		const chunks: Buffer[] = [];
		let bufferLength = 0;
		let aborted = false as boolean;
		// Per-connection serialization: each line chains onto the previous so `var x` resolves before `x + 1`.
		let chain: Promise<void> = Promise.resolve();
		socket.on('error', () => socket.destroy());
		socket.on('close', () => connections.delete(socket));
		socket.on('data', chunk => {
			if (aborted) return;
			dataEpoch++;
			bufferLength += chunk.length;
			if (bufferLength > maxBufferSize) {
				aborted = true;
				writeResponse(socket, { ok: false, stdout: '', stderr: '', output: 'Launcher RPC request exceeded maximum size' });
				socket.end();
				return;
			}
			chunks.push(chunk);
			// A data event may carry multiple newline-delimited requests; drain them all.
			while (true) {
				const found = findNewline(chunks);
				if (found === undefined) return;
				let consumed = 0;
				for (let index = 0; index < found.chunkIndex; index++) consumed += chunks[index]!.length;
				consumed += found.offset + 1;
				const line = takeLine(chunks, found.chunkIndex, found.offset);
				chunks.splice(0, found.chunkIndex);
				const remainder = chunks[0]!.subarray(found.offset + 1);
				if (remainder.length > 0) {
					chunks[0] = remainder;
				} else {
					chunks.shift();
				}
				bufferLength -= consumed;
				// Catch is intentional: a dispatch crash on a REPL transport shouldn't poison the
				// per-connection chain and silently drop every later request from this session.
				const next = chain.then(() => dispatch(line, socket, handle)).catch((err: unknown) => {
					const detail = err instanceof Error ? err.stack ?? err.message : String(err);
					process.stderr.write(`xxscreeps launcher RPC: dispatch crashed: ${detail}\n`);
					writeResponse(socket, { ok: false, stdout: '', stderr: '', output: 'RPC dispatch crashed' });
				});
				chain = next;
				pending.add(next);
				void next.finally(() => pending.delete(next));
			}
		});
	});
	const listening = Promise.withResolvers<undefined>();
	const onError = (err: Error) => listening.reject(err);
	const onListening = () => listening.resolve(undefined);
	server.once('error', onError);
	server.once('listening', onListening);
	server.listen(socketPath);
	try {
		await listening.promise;
	} finally {
		server.off('error', onError);
		server.off('listening', onListening);
	}
	if (process.platform !== 'win32') {
		// Tighten after bind; `net.listen` has no atomic mode option. Parent dir 0o700 is the real gate.
		fs.chmodSync(socketPath, 0o600);
	}
	return {
		close: async () => {
			const serverClosed = new Promise<void>(resolve => { server.close(() => resolve()); });
			// Drain until both `pending` is empty AND no new 'data' events arrived during the
			// drain — the yield gives any in-flight events a chance to fire before we exit the loop.
			let prevEpoch: number;
			do {
				prevEpoch = dataEpoch;
				if (pending.size > 0) {
					await Promise.allSettled([ ...pending ]);
				}
				await new Promise<void>(resolve => { setImmediate(resolve); });
			} while (pending.size > 0 || dataEpoch !== prevEpoch);
			for (const connection of connections) connection.destroy();
			await serverClosed;
		},
	};
}

async function dispatch(line: string, socket: net.Socket, handle: RequestHandler) {
	let request: LauncherRpcRequest;
	try {
		request = parseRequest(line);
	} catch (err) {
		// Protocol-level failure: bytes after this can't be trusted to align, so end the connection.
		const message = err instanceof Error ? err.message : String(err);
		writeResponse(socket, { ok: false, stdout: '', stderr: '', output: message });
		socket.end();
		return;
	}
	writeResponse(socket, await handle(request));
}

function writeResponse(socket: net.Socket, response: LauncherRpcResponse): void {
	if (!socket.writable) return;
	socket.write(`${JSON.stringify(response)}\n`);
}

function parseRequest(line: string): LauncherRpcRequest {
	const parsed = JSON.parse(line) as unknown;
	if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
		throw new Error('Invalid CLI request: expected object');
	}
	const { expression } = parsed as { expression?: unknown };
	if (typeof expression !== 'string') {
		throw new Error('Invalid CLI request: expression must be a string');
	}
	return { expression };
}

function parseResponse(line: string): LauncherRpcResponse {
	const parsed = JSON.parse(line) as unknown;
	if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
		throw new Error('Invalid CLI response: expected object');
	}
	const { ok, stdout, stderr, output } = parsed as Partial<LauncherRpcResponse>;
	if (typeof ok !== 'boolean' || typeof stdout !== 'string' ||
		typeof stderr !== 'string' || typeof output !== 'string') {
		throw new Error('Invalid CLI response: malformed field');
	}
	return { ok, stdout, stderr, output };
}

export interface LauncherRpcClient {
	readonly send: (request: LauncherRpcRequest) => Promise<LauncherRpcResponse>;
	readonly close: () => Promise<void>;
	readonly closed: Promise<undefined>;
	readonly [Symbol.asyncDispose]: () => Promise<void>;
}

export function connectLauncherRpc(socketPath: string): Promise<LauncherRpcClient> {
	const ready = Promise.withResolvers<LauncherRpcClient>();
	const closedPromise = Promise.withResolvers<undefined>();
	const socket = net.connect({ path: socketPath });
	const chunks: Buffer[] = [];
	let bufferLength = 0;
	let state: 'connecting' | 'open' | 'closed' = 'connecting';
	interface Pending {
		resolve: (response: LauncherRpcResponse) => void;
		reject: (err: Error) => void;
	}
	const queue: Pending[] = [];
	const failQueue = (err: Error) => {
		while (queue.length > 0) queue.shift()!.reject(err);
	};
	const close = (): Promise<void> => {
		if (state === 'closed') return Promise.resolve();
		const done = Promise.withResolvers<undefined>();
		socket.once('close', () => done.resolve(undefined));
		socket.end();
		return done.promise;
	};
	const client: LauncherRpcClient = {
		send(request) {
			if (state === 'closed') return Promise.reject(new Error('Launcher RPC connection is closed'));
			const pending = Promise.withResolvers<LauncherRpcResponse>();
			queue.push({ resolve: pending.resolve, reject: pending.reject });
			socket.write(`${JSON.stringify(request)}\n`);
			return pending.promise;
		},
		close,
		closed: closedPromise.promise,
		[Symbol.asyncDispose]: close,
	};
	socket.on('connect', () => {
		state = 'open';
		ready.resolve(client);
	});
	socket.on('error', err => {
		if (state === 'connecting') {
			ready.reject(err);
			return;
		}
		failQueue(err instanceof Error ? err : new Error(String(err)));
		socket.destroy();
	});
	socket.on('close', () => {
		state = 'closed';
		failQueue(new Error('Launcher RPC socket closed without response'));
		closedPromise.resolve(undefined);
	});
	socket.on('data', chunk => {
		bufferLength += chunk.length;
		if (bufferLength > maxBufferSize) {
			socket.destroy(new Error('Launcher RPC response exceeded maximum size'));
			return;
		}
		chunks.push(chunk);
		while (true) {
			const found = findNewline(chunks);
			if (found === undefined) return;
			let consumed = 0;
			for (let index = 0; index < found.chunkIndex; index++) consumed += chunks[index]!.length;
			consumed += found.offset + 1;
			const line = takeLine(chunks, found.chunkIndex, found.offset);
			chunks.splice(0, found.chunkIndex);
			const remainder = chunks[0]!.subarray(found.offset + 1);
			if (remainder.length > 0) {
				chunks[0] = remainder;
			} else {
				chunks.shift();
			}
			bufferLength -= consumed;
			const pending = queue.shift();
			if (pending === undefined) {
				socket.destroy(new Error('Launcher RPC sent response without matching request'));
				return;
			}
			try {
				pending.resolve(parseResponse(line));
			} catch (err) {
				pending.reject(err instanceof Error ? err : new Error(String(err)));
			}
		}
	});
	return ready.promise;
}
