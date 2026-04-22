import type { CommandSchemaGroup } from '../commands.js';
import fs from 'node:fs';
import net from 'node:net';
import { maxBufferSize } from '../socket.js';

export interface SocketResponse {
	ok?: boolean;
	result?: string;
	error?: string;
	stack?: string;
	echo?: boolean;
}

/** Open a connection, run a single expression, return the parsed response, close. */
export function callOnce(path: string, expression: string): Promise<SocketResponse> {
	return new Promise((resolve, reject) => {
		if (!fs.existsSync(path)) {
			reject(new Error(`Server is not running (no socket at ${path}). Start it with: xxscreeps start`));
			return;
		}
		const socket = net.connect({ path });
		let buffer = '';
		let settled = false;
		const done = (err: Error | null, value?: SocketResponse) => {
			if (settled) return;
			settled = true;
			socket.destroy();
			if (err) reject(err);
			else resolve(value!);
		};
		socket.on('connect', () => {
			socket.write(`${JSON.stringify({ expression })}\n`);
		});
		socket.on('data', chunk => {
			buffer += chunk.toString();
			if (buffer.length > maxBufferSize) {
				done(new Error('Server response exceeded buffer limit'));
				return;
			}
			const newline = buffer.indexOf('\n');
			if (newline === -1) return;
			const line = buffer.slice(0, newline);
			try {
				done(null, JSON.parse(line) as SocketResponse);
			} catch (err) {
				done(err instanceof Error ? err : new Error(String(err)));
			}
		});
		socket.on('error', err => done(err));
		socket.on('close', () => done(new Error('Server closed the connection before responding')));
	});
}

export async function fetchSchema(path: string): Promise<CommandSchemaGroup[]> {
	const response = await callOnce(path, 'JSON.stringify(commands())');
	if (response.ok === false || response.error !== undefined) {
		throw new Error(`Schema fetch failed: ${response.error ?? 'unknown error'}`);
	}
	if (response.result === undefined) throw new Error('Schema fetch returned no result');
	return JSON.parse(response.result) as CommandSchemaGroup[];
}
