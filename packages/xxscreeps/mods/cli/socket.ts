import type { Sandbox } from './sandbox.js';
import type { Database } from 'xxscreeps/engine/db/index.js';
import crypto from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import * as Path from 'node:path';
import { fileURLToPath } from 'node:url';
import { configPath } from 'xxscreeps/config/raw.js';
import { Shard } from 'xxscreeps/engine/db/index.js';
import { getServiceChannel } from 'xxscreeps/engine/service/index.js';
import { PauseCoordinator, createSandbox, destroySandbox, executeExpression } from './sandbox.js';

// Shared cap: server-side inbound limit, and clients mirror this to bound
// how much an unterminated server response can buffer.
export const maxBufferSize = 1 << 20;

export function socketPathFor(configUrl: URL) {
	return process.platform === 'win32'
		? `\\\\.\\pipe\\xxscreeps-${crypto.createHash('md5').update(configUrl.href).digest('hex').slice(0, 8)}`
		: fileURLToPath(new URL('screeps/cli.sock', configUrl));
}
export const socketPath = socketPathFor(configPath);

export async function startSocketServer(db: Database, defaultShard: Shard, path = socketPath, log = console.log) {
	// Clear a stale socket from a prior crash (Unix only).
	if (process.platform !== 'win32') {
		fs.mkdirSync(Path.dirname(path), { recursive: true });
		await new Promise<void>((resolve, reject) => {
			const probe = net.connect({ path }, () => {
				probe.destroy();
				reject(new Error(`Another server is already listening on ${path}`));
			});
			probe.on('error', (err: NodeJS.ErrnoException) => {
				if (err.code === 'ECONNREFUSED') {
					try { fs.unlinkSync(path); } catch {}
					resolve();
				} else if (err.code === 'ENOENT') {
					resolve();
				} else {
					reject(err);
				}
			});
		});
	}

	const connections = new Set<net.Socket>();
	// Shared across all sandboxes served by this process — only one pause can be
	// active at a time, and it needs to be visible to whichever client resumes it.
	const pause = new PauseCoordinator();
	const server = net.createServer(connection => {
		connections.add(connection);
		// Sandbox creation is deferred to the first message so the client can
		// select a non-default shard via an optional `shard` field. `ownedShard`
		// tracks a shard we opened on-demand (not the launcher-owned default) so
		// we can disconnect it when the connection closes.
		const state: ConnectionState = { db, defaultShard, pause, sandbox: null, ownedShard: null };

		let buffer = '';
		let processing = Promise.resolve();
		connection.on('error', err => {
			log(`CLI socket connection error: ${err.message}`);
			connection.destroy();
		});
		connection.on('close', () => {
			connections.delete(connection);
			void processing.finally(async () => {
				if (state.sandbox !== null) await destroySandbox(state.sandbox);
				if (state.ownedShard !== null) state.ownedShard.disconnect();
			}).catch(console.error);
		});

		connection.on('data', chunk => {
			buffer += chunk.toString();

			// Guard against unbounded buffer growth
			if (buffer.length > maxBufferSize) {
				connection.destroy();
				return;
			}

			// Queue messages sequentially so responses stay in order. The `.catch` is
			// defensive: handleMessage catches its own errors today, but we don't want
			// a future refactor to silently poison the chain and break serialization.
			let newline;
			while ((newline = buffer.indexOf('\n')) !== -1) {
				const line = buffer.slice(0, newline);
				buffer = buffer.slice(newline + 1);
				processing = processing
					.catch(() => {})
					.then(() => handleMessage(state, connection, line, log));
			}
		});
	});

	await new Promise<void>((resolve, reject) => {
		const onError = (err: Error) => {
			server.off('listening', onListening);
			reject(err);
		};
		const onListening = () => {
			server.off('error', onError);
			resolve();
		};
		server.once('error', onError);
		server.once('listening', onListening);
		server.listen(path);
	});

	// Restrict the control socket to the server's own UID. Unix-domain sockets
	// honor filesystem permissions on connect(), so this prevents other local
	// users from running CLI commands against the server.
	if (process.platform !== 'win32') {
		fs.chmodSync(path, 0o600);
	}

	const serviceSubscription = await getServiceChannel(defaultShard).subscribe();
	serviceSubscription.listen(message => {
		if (message.type === 'shutdown') void cleanup();
	});

	// Clean up socket and subscriptions so the event loop can drain. Idempotent
	// because both the service-shutdown listener and the launcher's caller may
	// invoke it on shutdown.
	let cleanupPromise: Promise<void> | undefined;
	function cleanup() {
		if (cleanupPromise !== undefined) return cleanupPromise;
		cleanupPromise = (async () => {
			serviceSubscription.disconnect();
			for (const connection of connections) {
				connection.destroy();
			}
			await new Promise<void>(resolve => { server.close(() => resolve()); });
			if (process.platform !== 'win32') {
				try { fs.unlinkSync(path); } catch {}
			}
		})();
		return cleanupPromise;
	}

	return cleanup;
}

interface ConnectionState {
	readonly db: Database;
	readonly defaultShard: Shard;
	readonly pause: PauseCoordinator;
	sandbox: Sandbox | null;
	ownedShard: Shard | null;
}

async function ensureSandbox(state: ConnectionState, shardName: string | undefined): Promise<Sandbox> {
	if (state.sandbox !== null) return state.sandbox;
	let shard = state.defaultShard;
	if (shardName !== undefined && shardName !== state.defaultShard.name) {
		shard = await Shard.connect(state.db, shardName);
		state.ownedShard = shard;
	}
	state.sandbox = createSandbox(state.db, shard, state.pause);
	return state.sandbox;
}

async function handleMessage(state: ConnectionState, connection: net.Socket, line: string, log: typeof console.log) {
	try {
		const { shard, expression } = JSON.parse(line) as { shard?: string; expression?: string };
		let sandbox: Sandbox;
		try {
			sandbox = await ensureSandbox(state, shard);
		} catch (err: unknown) {
			if (connection.writable) {
				const message = err instanceof Error ? err.message : String(err);
				connection.write(JSON.stringify({ ok: false, error: `Shard handshake failed: ${message}` }) + '\n');
			}
			connection.destroy();
			return;
		}
		// Pure handshake — client asked for a shard without an expression. Ack so
		// the client knows the shard was accepted before it sends the next message.
		if (expression === undefined) {
			if (connection.writable) {
				connection.write(JSON.stringify({ ok: true }) + '\n');
			}
			return;
		}
		const outcome = await executeExpression(sandbox, expression);
		if (outcome.ok && outcome.echo) {
			log(outcome.result);
		}
		if (connection.writable) {
			const payload: Record<string, unknown> = { ok: outcome.ok, result: outcome.result };
			if (outcome.ok) {
				if (outcome.echo) payload.echo = true;
			} else {
				payload.error = outcome.error;
				if (outcome.stack !== undefined) payload.stack = outcome.stack;
			}
			connection.write(JSON.stringify(payload) + '\n');
		}
	} catch (err: unknown) {
		if (connection.writable) {
			const message = err instanceof Error ? err.message : String(err);
			connection.write(JSON.stringify({ ok: false, error: message }) + '\n');
		}
	}
}
