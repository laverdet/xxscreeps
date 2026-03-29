import net from 'node:net';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { configPath } from 'xxscreeps/config/raw.js';
import type { Database, Shard } from 'xxscreeps/engine/db/index.js';
import { getServiceChannel } from 'xxscreeps/engine/service/index.js';
import { executeCommand } from './sandbox.js';

const maxBufferSize = 1 << 20; // 1 MiB per connection

export const socketPath = process.platform === 'win32'
	? `\\\\.\\pipe\\xxscreeps-${crypto.createHash('md5').update(configPath.href).digest('hex').slice(0, 8)}`
	: fileURLToPath(new URL('screeps/cli.sock', configPath));

export async function startSocketServer(db: Database, shard: Shard, path = socketPath, log = console.log) {
	// On Unix, check for a stale socket from a previous crash
	if (process.platform !== 'win32') {
		await new Promise<void>((resolve, reject) => {
			const probe = net.connect({ path }, () => {
				probe.destroy();
				reject(new Error(`Another server is already listening on ${path}`));
			});
			probe.on('error', () => {
				// Connection refused or no such file — safe to clean up
				try { fs.unlinkSync(path); } catch {}
				resolve();
			});
		});
	}

	const connections = new Set<net.Socket>();
	const server = net.createServer(connection => {
		connections.add(connection);
		connection.on('close', () => connections.delete(connection));

		let buffer = '';
		let processing = Promise.resolve();

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
				processing = processing.then(() => handleMessage(db, shard, connection, line, log));
			}
		});
	});

	server.listen(path);

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
const serverLogResults = new Set(['Simulation paused', 'Simulation resumed']);

async function handleMessage(db: Database, shard: Shard, connection: net.Socket, line: string, log: typeof console.log) {
	try {
		const { expression } = JSON.parse(line);
		const result = await executeCommand(db, shard, expression);
		if (serverLogResults.has(result)) {
			log(result);
		}
		if (connection.writable) {
			connection.write(JSON.stringify({ result }) + '\n');
		}
	} catch (err: any) {
		if (connection.writable) {
			connection.write(JSON.stringify({ error: err.message }) + '\n');
		}
	}
}
