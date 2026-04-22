import type { Sandbox } from './sandbox.js';
import type { Database, Shard } from 'xxscreeps/engine/db/index.js';
import crypto from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import * as Path from 'node:path';
import { fileURLToPath } from 'node:url';
import { configPath } from 'xxscreeps/config/raw.js';
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

export async function startSocketServer(db: Database, shard: Shard, path = socketPath, log = console.log) {
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
		const sandbox = createSandbox(db, shard, pause);

		let buffer = '';
		let processing = Promise.resolve();
		connection.on('error', err => {
			log(`CLI socket connection error: ${err.message}`);
			connection.destroy();
		});
		connection.on('close', () => {
			connections.delete(connection);
			void processing.finally(() => destroySandbox(sandbox)).catch(console.error);
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
					.then(() => handleMessage(sandbox, connection, line, log));
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

	const serviceSubscription = await getServiceChannel(shard).subscribe();
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

async function handleMessage(sandbox: Sandbox, connection: net.Socket, line: string, log: typeof console.log) {
	try {
		const { expression } = JSON.parse(line) as { expression: string };
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
