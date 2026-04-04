import type { Sandbox } from './sandbox.js';
import type { Database, Shard } from 'xxscreeps/engine/db/index.js';
import crypto from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import * as Path from 'node:path';
import { fileURLToPath } from 'node:url';
import { configPath } from 'xxscreeps/config/raw.js';
import { getServiceChannel } from 'xxscreeps/engine/service/index.js';
import { createSandbox, destroySandbox, executeCommand } from './sandbox.js';

const maxBufferSize = 1 << 20; // 1 MiB per connection

export function socketPathFor(configUrl: URL) {
	return process.platform === 'win32'
		? `\\\\.\\pipe\\xxscreeps-${crypto.createHash('md5').update(configUrl.href).digest('hex').slice(0, 8)}`
		: fileURLToPath(new URL('screeps/cli.sock', configUrl));
}
export const socketPath = socketPathFor(configPath);

export async function startSocketServer(db: Database, shard: Shard, path = socketPath, log = console.log) {
	// On Unix, check for a stale socket from a previous crash
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
	const server = net.createServer(connection => {
		connections.add(connection);

		// Persistent sandbox for this connection — variables survive between commands
		const sandbox = createSandbox(db, shard);

		let buffer = '';
		let processing = Promise.resolve();
		connection.on('error', () => {
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

			// Queue messages sequentially so responses stay in order
			let newline;
			while ((newline = buffer.indexOf('\n')) !== -1) {
				const line = buffer.slice(0, newline);
				buffer = buffer.slice(newline + 1);
				processing = processing.then(() => handleMessage(sandbox, connection, line, log));
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

	const serviceSubscription = await getServiceChannel(shard).subscribe();
	serviceSubscription.listen(message => {
		if (message.type === 'shutdown') cleanup();
	});

	// Clean up socket and subscriptions so the event loop can drain
	function cleanup() {
		serviceSubscription.disconnect();
		for (const connection of connections) {
			connection.destroy();
		}
		server.close();
		if (process.platform !== 'win32') {
			try { fs.unlinkSync(path); } catch {}
		}
	}

	return cleanup;
}

// Results that should be echoed to the server console
const serverLogResults = new Set([ 'Simulation paused', 'Simulation resumed' ]);

async function handleMessage(sandbox: Sandbox, connection: net.Socket, line: string, log: typeof console.log) {
	try {
		const { expression } = JSON.parse(line) as { expression: string };
		const result = await executeCommand(sandbox, expression);
		if (serverLogResults.has(result)) {
			log(result);
		}
		if (connection.writable) {
			connection.write(JSON.stringify({ result }) + '\n');
		}
	} catch (err: unknown) {
		if (connection.writable) {
			const message = err instanceof Error ? err.message : String(err);
			connection.write(JSON.stringify({ error: message }) + '\n');
		}
	}
}
