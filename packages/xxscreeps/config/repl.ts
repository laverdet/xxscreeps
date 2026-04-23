import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import { maxBufferSize, socketPath } from 'xxscreeps/mods/cli/socket.js';

// Minimal arg parsing — only `--shard <name>` is recognized. The unused
// positionals are ignored so the rest of the REPL path is unchanged.
function parseShardFlag(argv: readonly string[]): string | undefined {
	for (let idx = 0; idx < argv.length; ++idx) {
		const arg = argv[idx];
		if (arg === '--shard') return argv[idx + 1];
		if (arg.startsWith('--shard=')) return arg.slice('--shard='.length);
	}
	return undefined;
}
const shardArg = parseShardFlag(process.argv.slice(2));

if (process.platform !== 'win32' && !fs.existsSync(socketPath)) {
	console.error('Server is not running. Start it with: xxscreeps start');
} else {
	const socket = net.connect({ path: socketPath });
	let responseBuffer = '';

	const builtins = [ 'help', 'commands', 'print' ];
	let topLevel: string[] = [ ...builtins ];
	const dotMembers = new Map<string, string[]>();

	type SchemaGroup = {
		name: string;
		commands: { name: string }[];
	};

	function applySchema(groups: readonly SchemaGroup[]) {
		const names = new Set<string>(builtins);
		dotMembers.clear();
		for (const group of groups) {
			names.add(group.name);
			dotMembers.set(group.name, group.commands.map(cmd => cmd.name));
		}
		// Raw-value aliases injected by the CLI mod but not present in the schema.
		for (const raw of [ 'db', 'shard', 'storage' ]) names.add(raw);
		dotMembers.set('storage', [ 'db', 'shard', 'pubsub' ]);
		topLevel = [ ...names ].sort();
	}

	function completer(line: string): [string[], string] {
		const dot = line.lastIndexOf('.');
		if (dot !== -1) {
			const obj = line.slice(0, dot);
			const partial = line.slice(dot + 1);
			const members = dotMembers.get(obj);
			if (members) {
				const hits = members.filter(name => name.startsWith(partial)).map(name => `${obj}.${name}`);
				return [ hits.length ? hits : [], line ];
			}
		}
		const hits = topLevel.filter(name => name.startsWith(line));
		return [ hits.length ? hits : [], line ];
	}

	// Cap is chosen so readline's linear up-arrow scan stays snappy.
	const historyFile = path.join(os.homedir(), '.xxscreeps_history');
	const historyLimit = 1000;
	const initialHistory = (() => {
		try {
			return fs.readFileSync(historyFile, 'utf8')
				.split('\n')
				.filter(line => line.length > 0)
				.slice(-historyLimit);
		} catch { return []; }
	})();

	const rl = readline.createInterface({
		input: process.stdin,
		output: process.stdout,
		prompt: '> ',
		completer,
		// readline expects history in reverse-chronological order (newest first).
		history: initialHistory.slice().reverse(),
		historySize: historyLimit,
		removeHistoryDuplicates: true,
	});
	let historyDirty = false;
	function appendHistory(line: string) {
		if (!line || line === 'quit' || line === 'exit') return;
		historyDirty = true;
		try {
			fs.appendFileSync(historyFile, line + '\n');
		} catch { /* ignore — history is best-effort */ }
	}
	function trimHistoryFile() {
		try {
			const lines = fs.readFileSync(historyFile, 'utf8').split('\n').filter(line => line.length > 0);
			if (lines.length > historyLimit * 2) {
				fs.writeFileSync(historyFile, lines.slice(-historyLimit).join('\n') + '\n');
			}
		} catch { /* ignore */ }
	}
	let schemaReady = false;
	let ready = false;
	let waiting = false;
	let stdinClosed = false;
	let socketEnded = false;
	// Buffers input that arrives before the handshake completes, so piped
	// invocations like `xxscreeps <<< 'help()\nexit\n'` don't lose lines.
	const pending: string[] = [];

	socket.on('connect', () => {
		const handshake: Record<string, unknown> = { expression: 'JSON.stringify(commands())' };
		if (shardArg !== undefined) handshake.shard = shardArg;
		socket.write(JSON.stringify(handshake) + '\n');
	});

	function prompt() {
		// Guards ERR_USE_AFTER_CLOSE: piped input can close readline before the
		// server response lands.
		if (!stdinClosed) rl.prompt();
	}

	function maybeEndSocket() {
		// Ends only when nothing is outstanding; each outstanding path re-invokes
		// this on completion. Premature end would write-after-end pending input.
		if (stdinClosed && !waiting && pending.length === 0 && !socketEnded) {
			socketEnded = true;
			socket.end();
		}
	}

	function finishHandshake() {
		if (ready) return;
		ready = true;
		console.log('Connected to xxscreeps server.');
		console.log('Type help() for available commands.\n');
		if (pending.length > 0) {
			submit(pending.shift()!);
		} else if (stdinClosed) {
			maybeEndSocket();
		} else {
			prompt();
		}
	}

	function submit(line: string) {
		if (line === 'quit' || line === 'exit') {
			stdinClosed = true;
			maybeEndSocket();
			return;
		}
		appendHistory(line);
		waiting = true;
		socket.write(JSON.stringify({ expression: line }) + '\n');
	}

	socket.on('data', chunk => {
		responseBuffer += chunk.toString();
		if (responseBuffer.length > maxBufferSize) {
			console.error('Server response exceeded buffer limit; closing connection.');
			socket.destroy();
			return;
		}
		let newline;
		while ((newline = responseBuffer.indexOf('\n')) !== -1) {
			const line = responseBuffer.slice(0, newline);
			responseBuffer = responseBuffer.slice(newline + 1);

			if (!schemaReady) {
				schemaReady = true;
				// First response is the schema probe; fall through to builtins on
				// any parse failure so older servers still work.
				try {
					const { result, error } = JSON.parse(line) as { result?: string; error?: string };
					if (error === undefined && typeof result === 'string') {
						const groups = JSON.parse(result) as SchemaGroup[];
						applySchema(groups);
					}
				} catch {}
				finishHandshake();
				continue;
			}

			try {
				// `result` includes captured print() output and handler stacks;
				// `error` is the admin-CLI field without print lines.
				const { result, error } = JSON.parse(line) as { result?: string; error?: string };
				console.log(result ?? error);
			} catch {
				console.log(line);
			}
			waiting = false;
			if (pending.length > 0) {
				submit(pending.shift()!);
			} else if (stdinClosed) {
				maybeEndSocket();
			} else {
				prompt();
			}
		}
	});

	socket.on('error', (err: NodeJS.ErrnoException) => {
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

	rl.on('line', line => {
		const trimmed = line.trim();
		if (!trimmed) {
			if (ready && !waiting) prompt();
			return;
		}
		if (!ready || waiting) {
			pending.push(trimmed);
			return;
		}
		submit(trimmed);
	});

	rl.on('close', () => {
		stdinClosed = true;
		if (historyDirty) trimHistoryFile();
		maybeEndSocket();
	});
}
