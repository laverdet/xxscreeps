import net from 'node:net';
import fs from 'node:fs';
import readline from 'node:readline';
import { socketPath } from 'xxscreeps/mods/backend/cli/socket.js';

// Verify socket exists before connecting (Unix only; named pipes don't have a file)
if (process.platform !== 'win32' && !fs.existsSync(socketPath)) {
	console.error('Server is not running. Start it with: xxscreeps start');
} else {
	const socket = net.connect({ path: socketPath });
	let responseBuffer = '';

	const topLevel = [
		'db', 'shard', 'storage', 'users', 'rooms', 'system', 'shards', 'help',
	];
	const dotMembers: Record<string, string[]> = {
		storage: ['db', 'shard', 'pubsub'],
		users: ['findByName', 'info'],
		rooms: ['list', 'load'],
		system: ['getTickDuration', 'setTickDuration', 'pauseSimulation', 'resumeSimulation', 'resetAllData', 'sendServerMessage'],
		shards: ['list', 'get'],
	};

	function completer(line: string): [string[], string] {
		const dot = line.lastIndexOf('.');
		if (dot !== -1) {
			const obj = line.slice(0, dot);
			const partial = line.slice(dot + 1);
			const members = dotMembers[obj];
			if (members) {
				const hits = members.filter(m => m.startsWith(partial)).map(m => `${obj}.${m}`);
				return [hits.length ? hits : [], line];
			}
		}
		const hits = topLevel.filter(t => t.startsWith(line));
		return [hits.length ? hits : [], line];
	}

	const rl = readline.createInterface({
		input: process.stdin,
		output: process.stdout,
		prompt: '> ',
		completer,
	});

	socket.on('connect', () => {
		console.log('Connected to xxscreeps server.');
		console.log('Type help() for available commands.\n');
		rl.prompt();
	});

	socket.on('data', chunk => {
		responseBuffer += chunk.toString();
		let newline;
		while ((newline = responseBuffer.indexOf('\n')) !== -1) {
			const line = responseBuffer.slice(0, newline);
			responseBuffer = responseBuffer.slice(newline + 1);
			try {
				const { result, error } = JSON.parse(line);
				console.log(error ?? result);
			} catch {
				console.log(line);
			}
			waiting = false;
			rl.prompt();
		}
	});

	socket.on('error', (err: any) => {
		if (err.code === 'ECONNREFUSED' || err.code === 'ENOENT') {
			console.error('Server is not running. Start it with: xxscreeps start');
		} else {
			console.error('Connection error:', err.message);
		}
		process.exit(1);
	});

	socket.on('close', () => {
		console.log('Disconnected.');
		process.exit(0);
	});

	let waiting = false;

	rl.on('line', line => {
		const trimmed = line.trim();
		if (!trimmed) {
			rl.prompt();
			return;
		}
		if (trimmed === 'quit' || trimmed === 'exit') {
			socket.end();
			return;
		}
		if (waiting) return;
		waiting = true;
		socket.write(JSON.stringify({ expression: line }) + '\n');
	});

	rl.on('close', () => {
		socket.end();
	});
}
