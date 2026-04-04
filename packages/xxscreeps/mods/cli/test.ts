import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import fs from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { importMods } from 'xxscreeps/config/mods/index.js';
import { Database, Shard } from 'xxscreeps/engine/db/index.js';
import * as User from 'xxscreeps/engine/db/user/index.js';
import { initializeGameEnvironment } from 'xxscreeps/game/index.js';
import { instantiateTestShard, seedTestShard } from 'xxscreeps/test/import.js';
import { assert, describe, test } from 'xxscreeps/test/index.js';
import { createSandbox, destroySandbox, executeCommand } from './sandbox.js';
import { socketPathFor, startSocketServer } from './socket.js';
import 'xxscreeps/config/mods/import/game.js';

await importMods('render');
initializeGameEnvironment();

const { db, shard } = await instantiateTestShard();

// Per-call sandbox for isolation tests (fresh context per run() call)
const run = async (expression: string) => {
	const sandbox = createSandbox(db, shard);
	try {
		return await executeCommand(sandbox, expression);
	} finally {
		await destroySandbox(sandbox);
	}
};

const entryPath = fileURLToPath(import.meta.resolve('xxscreeps/config/entry.js'));

type SocketResponse = { result?: string; error?: string };
type SpawnedEntry = {
	child: ChildProcessWithoutNullStreams;
	stderr: () => string;
	stdout: () => string;
};
type SmokeEnvironmentOptions = {
	configLines?: string[];
	mods?: string[];
	singleThreaded?: boolean;
};

function socketPathForRoot(root: string) {
	return socketPathFor(pathToFileURL(path.join(root, '.screepsrc.yaml')));
}

async function createSmokeEnvironment({
	configLines = [],
	mods = [
		'xxscreeps/mods/classic',
		'xxscreeps/mods/cli',
	],
	singleThreaded = true,
}: SmokeEnvironmentOptions = {}) {
	const root = await fs.mkdtemp(path.join(os.tmpdir(), 'xxscreeps-cli-smoke-'));
	await fs.writeFile(path.join(root, '.screepsrc.yaml'), [
		'mods:',
		...mods.map(mod => `  - ${mod}`),
		'launcher:',
		`  singleThreaded: ${singleThreaded}`,
		'game:',
		'  tickSpeed: 500',
		...configLines,
	].join('\n') + '\n', 'utf8');

	const databasePath = pathToFileURL(path.join(root, 'screeps/db')).href;
	const shardPath = pathToFileURL(path.join(root, 'screeps/shard0')).href;
	const suffix = path.basename(root);
	const smokeDb = await Database.connect({
		data: databasePath,
		pubsub: `local://${suffix}-db`,
	});
	const smokeShard = await Shard.connectWith(smokeDb, {
		name: 'shard0',
		data: shardPath,
		pubsub: `local://${suffix}-shard`,
		scratch: `local://${suffix}-scratch`,
	});
	try {
		await seedTestShard(smokeDb, smokeShard);
		await Promise.all([ smokeDb.save(), smokeShard.save() ]);
	} finally {
		smokeShard.disconnect();
		smokeDb.disconnect();
	}

	return {
		databasePath,
		root,
		shardPath,
		socketPath: socketPathForRoot(root),
		async cleanup() {
			await fs.rm(root, { force: true, recursive: true });
		},
	};
}

async function getFreePort() {
	return new Promise<number>((resolve, reject) => {
		const server = net.createServer();
		server.once('error', reject);
		server.listen(0, '127.0.0.1', () => {
			const address = server.address();
			if (!address || typeof address === 'string') {
				server.close();
				reject(new Error('Failed to allocate a TCP port'));
				return;
			}
			server.close(error => {
				if (error) {
					reject(error);
				} else {
					resolve(address.port);
				}
			});
		});
	});
}

function spawnEntry(root: string, args: string[]) {
	const child = spawn(process.execPath, [ entryPath, ...args ], {
		cwd: root,
		stdio: [ 'pipe', 'pipe', 'pipe' ],
	});
	let stdout = '';
	let stderr = '';
	child.stdout.on('data', chunk => {
		stdout += chunk.toString();
	});
	child.stderr.on('data', chunk => {
		stderr += chunk.toString();
	});
	return {
		child,
		stderr: () => stderr,
		stdout: () => stdout,
	} satisfies SpawnedEntry;
}

async function runEntry(root: string, args: string[], input: string) {
	const proc = spawnEntry(root, args);
	proc.child.stdin.end(input);
	const [ code, signal ] = await once(proc.child, 'exit') as [ number | null, NodeJS.Signals | null ];
	return {
		code,
		signal,
		stderr: proc.stderr(),
		stdout: proc.stdout(),
	};
}

async function stopEntry(proc: SpawnedEntry) {
	if (proc.child.exitCode !== null || proc.child.signalCode !== null) {
		return;
	}
	proc.child.kill('SIGINT');
	const exited = once(proc.child, 'exit');
	await Promise.race([
		exited,
		delay(2000).then(() => {
			proc.child.kill('SIGKILL');
		}),
	]);
	await exited;
}

async function waitForSocketReady(path: string, proc: SpawnedEntry) {
	const deadline = Date.now() + 5000;
	while (Date.now() < deadline) {
		if (proc.child.exitCode !== null || proc.child.signalCode !== null) {
			throw new Error(`CLI server exited before binding socket.\nstdout:\n${proc.stdout()}\nstderr:\n${proc.stderr()}`);
		}
		try {
			const response = await sendCommand(path, 'help()');
			if (response.result?.includes('Available objects and functions')) {
				return;
			}
		} catch {}
		await delay(50);
	}
	throw new Error(`Timed out waiting for socket ${path}.\nstdout:\n${proc.stdout()}\nstderr:\n${proc.stderr()}`);
}

async function waitForHttpReady(url: string, proc: SpawnedEntry) {
	const deadline = Date.now() + 5000;
	while (Date.now() < deadline) {
		if (proc.child.exitCode !== null || proc.child.signalCode !== null) {
			throw new Error(`Backend exited before listening.\nstdout:\n${proc.stdout()}\nstderr:\n${proc.stderr()}`);
		}
		try {
			const response = await fetch(url);
			if (response.ok) {
				return;
			}
		} catch {}
		await delay(50);
	}
	throw new Error(`Timed out waiting for backend ${url}.\nstdout:\n${proc.stdout()}\nstderr:\n${proc.stderr()}`);
}

async function waitForOutput(proc: SpawnedEntry, pattern: RegExp) {
	const deadline = Date.now() + 5000;
	while (Date.now() < deadline) {
		if (pattern.test(proc.stdout()) || pattern.test(proc.stderr())) {
			return;
		}
		if (proc.child.exitCode !== null || proc.child.signalCode !== null) {
			throw new Error(`Process exited before emitting ${pattern}.\nstdout:\n${proc.stdout()}\nstderr:\n${proc.stderr()}`);
		}
		await delay(50);
	}
	throw new Error(`Timed out waiting for ${pattern}.\nstdout:\n${proc.stdout()}\nstderr:\n${proc.stderr()}`);
}

async function openConnection(testPath: string) {
	const socket = net.connect({ path: testPath });
	const pending: {
		reject: (error: Error) => void;
		resolve: (response: SocketResponse) => void;
	}[] = [];
	let buffer = '';
	const rejectPending = (error: Error) => {
		while (pending.length > 0) {
			pending.shift()!.reject(error);
		}
	};
	socket.on('data', chunk => {
		buffer += chunk.toString();
		let newline;
		while ((newline = buffer.indexOf('\n')) !== -1) {
			const line = buffer.slice(0, newline);
			buffer = buffer.slice(newline + 1);
			const waiter = pending.shift();
			if (!waiter) {
				rejectPending(new Error(`Unexpected CLI response: ${line}`));
				continue;
			}
			waiter.resolve(JSON.parse(line) as SocketResponse);
		}
	});
	socket.on('error', rejectPending);
	socket.on('close', () => rejectPending(new Error('Socket closed')));
	await once(socket, 'connect');
	return {
		async destroy() {
			if (socket.destroyed) {
				return;
			}
			socket.destroy();
			await once(socket, 'close');
		},
		send(expression: string) {
			return new Promise<SocketResponse>((resolve, reject) => {
				pending.push({ resolve, reject });
				socket.write(JSON.stringify({ expression }) + '\n');
			});
		},
	};
}

describe('CLI', () => {

	describe('Expression evaluation', () => {
		test('simple expression returns result', async () => {
			assert.strictEqual(await run('1 + 1'), '2');
		});

		test('string result returned as-is', async () => {
			assert.strictEqual(await run('"hello"'), 'hello');
		});

		test('undefined expression returns undefined', async () => {
			assert.strictEqual(await run('undefined'), 'undefined');
		});

		test('empty expression returns undefined', async () => {
			assert.strictEqual(await run(''), 'undefined');
		});

		test('object result is inspected', async () => {
			const result = await run('({ a: 1 })');
			assert.ok(result.includes('{ a: 1 }'));
		});

		test('async expression resolves', async () => {
			assert.strictEqual(await run('Promise.resolve(42)'), '42');
		});
	});

	describe('Output capture', () => {
		test('print() captures output', async () => {
			const result = await run('print("hello"); 42');
			assert.ok(result.startsWith('hello\n'));
			assert.ok(result.endsWith('42'));
		});

		test('print() joins multiple args with space', async () => {
			const result = await run('print("a", "b", "c")');
			assert.ok(result.includes('a b c'));
		});

		test('console.log aliases print', async () => {
			const result = await run('console.log("test"); 1');
			assert.ok(result.startsWith('test\n'));
		});

		test('multiple prints accumulate', async () => {
			const result = await run('print("a"); print("b"); 0');
			assert.ok(result.startsWith('a\nb\n'));
		});

		test('print() inspects non-string args', async () => {
			const result = await run('print(42, { a: 1 })');
			assert.ok(result.includes('42 { a: 1 }'));
		});
	});

	describe('Error handling', () => {
		test('syntax error returns error text', async () => {
			const result = await run('function(');
			assert.ok(result.includes('SyntaxError'));
		});

		test('runtime error returns stack trace', async () => {
			const result = await run('throw new Error("boom")');
			assert.ok(result.includes('boom'));
		});

		test('rejected promise returns error', async () => {
			const result = await run('Promise.reject(new Error("async boom"))');
			assert.ok(result.includes('async boom'));
		});

		test('infinite loop times out', async () => {
			const result = await run('while(true){}');
			assert.ok(result.includes('timed out') || result.includes('Script execution timed out'));
		});

		test('async expression that never resolves times out', async () => {
			const result = await run('await new Promise(() => {})');
			assert.ok(result.includes('Async execution timed out'));
		});

		test('output is preserved when error occurs', async () => {
			const result = await run('print("step 1"); throw new Error("boom")');
			assert.ok(result.startsWith('step 1\n'));
			assert.ok(result.includes('boom'));
		});
	});

	describe('Top-level await', () => {
		test('single await expression returns result', async () => {
			assert.strictEqual(await run('await Promise.resolve(42)'), '42');
		});

		test('multi-statement with await', async () => {
			const result = await run('let x = await Promise.resolve(10); print(x)');
			assert.ok(result.includes('10'));
		});

		test('await with rooms.list()', async () => {
			const result = await run('await rooms.list()');
			assert.ok(result.includes('W'));
		});

		test('setTimeout is available for async patterns', async () => {
			assert.strictEqual(await run('await new Promise(r => setTimeout(r, 10, "ok"))'), 'ok');
		});
	});

	describe('Persistent sandbox', () => {
		test('variables persist across commands in the same sandbox', async () => {
			const sandbox = createSandbox(db, shard);
			try {
				await executeCommand(sandbox, 'var foo = 123');
				assert.strictEqual(await executeCommand(sandbox, 'foo'), '123');
			} finally {
				await destroySandbox(sandbox);
			}
		});

		test('separate sandboxes are isolated', async () => {
			const sandboxA = createSandbox(db, shard);
			const sandboxB = createSandbox(db, shard);
			try {
				await executeCommand(sandboxA, 'var bar = 456');
				assert.strictEqual(await executeCommand(sandboxB, 'typeof bar'), 'undefined');
			} finally {
				await Promise.all([ destroySandbox(sandboxA), destroySandbox(sandboxB) ]);
			}
		});

		test('async output stays with the originating command', async () => {
			const sandbox = createSandbox(db, shard);
			try {
				const [ first, second ] = await Promise.all([
					executeCommand(sandbox, 'await db.smembers("users").then(() => (print("first"), "done1"))'),
					executeCommand(sandbox, 'print("second"); "done2"'),
				]);
				assert.strictEqual(first, 'first\ndone1');
				assert.strictEqual(second, 'second\ndone2');
			} finally {
				await destroySandbox(sandbox);
			}
		});
	});

	describe('Help', () => {
		test('help() returns usage string', async () => {
			const result = await run('help()');
			assert.ok(result.includes('print'));
			assert.ok(result.includes('rooms'));
			assert.ok(result.includes('users'));
		});
	});

	describe('Database access', () => {
		test('shard.get returns game time', async () => {
			const result = await run('shard.get("time")');
			assert.ok(result !== 'null');
			assert.ok(result !== 'undefined');
		});

		test('db provider is functional', async () => {
			const result = await run('await db.smembers("users")');
			assert.ok(result.includes('100'));
		});

		test('storage.db aliases db', async () => {
			assert.strictEqual(await run('storage.db === db'), 'true');
			assert.strictEqual(await run('typeof db.get'), 'function');
		});

		test('storage.shard aliases shard', async () => {
			assert.strictEqual(await run('storage.shard === shard'), 'true');
			assert.strictEqual(await run('typeof shard.get'), 'function');
		});

		test('storage.pubsub is available', async () => {
			const result = await run('typeof storage.pubsub.publish');
			assert.strictEqual(result, 'function');
		});
	});

	describe('Room helpers', () => {
		test('rooms.list() returns room names', async () => {
			const result = await run('JSON.stringify(await rooms.list())');
			const rooms = JSON.parse(result) as string[];
			assert.ok(Array.isArray(rooms));
			assert.ok(rooms.length > 0);
			assert.ok(rooms.every((name: string) => /^[WE]\d+[NS]\d+$/.test(name)));
		});

		test('rooms.load() returns a plain object keyed by _id', async () => {
			const result = await run('JSON.stringify(await rooms.load("W5N5"))');
			const snapshot = JSON.parse(result) as Record<string, Record<string, unknown>>;
			const ids = Object.keys(snapshot);
			assert.ok(ids.length === 4);
			for (const id of ids) {
				assert.strictEqual(snapshot[id]._id, id);
			}
		});

		test('rooms.load() objects have rendered fields', async () => {
			const result = await run('JSON.stringify(await rooms.load("W5N5"))');
			const snapshot = JSON.parse(result) as Record<string, Record<string, unknown>>;
			for (const object of Object.values(snapshot)) {
				assert.ok(typeof object._id === 'string');
				assert.ok(typeof object.type === 'string');
				assert.ok(typeof object.x === 'number');
				assert.ok(typeof object.y === 'number');
			}
		});

		test('rooms.load() includes all object types in room', async () => {
			const result = await run('JSON.stringify(await rooms.load("W9N9"))');
			const types = new Set(Object.values(JSON.parse(result) as Record<string, Record<string, unknown>>).map(obj => obj.type));
			assert.ok(types.has('controller'));
			assert.ok(types.has('source'));
			assert.ok(types.has('mineral'));
		});

		test('rooms.load() controller has rendered properties', async () => {
			const result = await run('JSON.stringify(await rooms.load("W9N9"))');
			const controller = Object.values(JSON.parse(result) as Record<string, Record<string, unknown>>).find(obj => obj.type === 'controller')!;
			assert.ok('level' in controller);
			assert.ok('downgradeTime' in controller);
			assert.ok('safeModeAvailable' in controller);
		});

		test('rooms.load() with non-existent room throws', async () => {
			const result = await run('await rooms.load("X9X9")');
			assert.ok(result.includes('Error'));
		});
	});

	describe('System', () => {
		test('system.getTickDuration returns a positive number', async () => {
			const result = await run('system.getTickDuration()');
			const value = Number(result);
			assert.ok(Number.isFinite(value) && value > 0);
		});

		test('system.setTickDuration rejects invalid input', async () => {
			assert.strictEqual(await run('system.setTickDuration(-1)'), 'Invalid tick duration');
			assert.strictEqual(await run('system.setTickDuration("fast")'), 'Invalid tick duration');
		});

		test('system.pauseSimulation acquires lock and returns confirmation', async () => {
			const sandbox = createSandbox(db, shard);
			try {
				assert.strictEqual(await executeCommand(sandbox, 'system.pauseSimulation()'), 'Simulation paused');
			} finally {
				await destroySandbox(sandbox);
			}
		});

		test('system.pauseSimulation when already paused returns error', async () => {
			const sandbox = createSandbox(db, shard);
			try {
				assert.strictEqual(await executeCommand(sandbox, 'system.pauseSimulation()'), 'Simulation paused');
				assert.strictEqual(await executeCommand(sandbox, 'system.pauseSimulation()'), 'Simulation is already paused');
			} finally {
				await destroySandbox(sandbox);
			}
		});

		test('system.resumeSimulation releases lock and returns confirmation', async () => {
			const sandbox = createSandbox(db, shard);
			try {
				assert.strictEqual(await executeCommand(sandbox, 'system.pauseSimulation()'), 'Simulation paused');
				assert.strictEqual(await executeCommand(sandbox, 'system.resumeSimulation()'), 'Simulation resumed');
			} finally {
				await destroySandbox(sandbox);
			}
		});

		test('system.resumeSimulation when not paused returns error', async () => {
			assert.strictEqual(await run('system.resumeSimulation()'), 'Simulation is not paused');
		});

		test('destroySandbox releases a pause lock owned by the session', async () => {
			const sandboxA = createSandbox(db, shard);
			const sandboxB = createSandbox(db, shard);
			try {
				assert.strictEqual(await executeCommand(sandboxA, 'system.pauseSimulation()'), 'Simulation paused');
				await destroySandbox(sandboxA);
				assert.strictEqual(await executeCommand(sandboxB, 'system.pauseSimulation()'), 'Simulation paused');
				assert.strictEqual(await executeCommand(sandboxB, 'system.resumeSimulation()'), 'Simulation resumed');
			} finally {
				await Promise.all([ destroySandbox(sandboxA), destroySandbox(sandboxB) ]);
			}
		});

		test('system.sendServerMessage returns confirmation', async () => {
			const result = await run('system.sendServerMessage("test")');
			assert.ok(result.includes('Message sent to'));
		});

		test('system.sendServerMessage rejects empty input', async () => {
			assert.strictEqual(await run('system.sendServerMessage("")'), 'Invalid message');
			assert.strictEqual(await run('system.sendServerMessage(123)'), 'Invalid message');
		});

		test('system.resetAllData returns manual steps', async () => {
			const result = await run('system.resetAllData()');
			assert.ok(result.includes('Not implemented'));
		});
	});

	describe('Shards', () => {
		test('shards.list() returns array containing shard0', async () => {
			const result = await run('JSON.stringify(shards.list())');
			const names = JSON.parse(result) as string[];
			assert.ok(Array.isArray(names));
			assert.ok(names.includes('shard0'));
		});

		test('shards.get() returns shard context with name', async () => {
			const result = await run('(await shards.get("shard0")).name');
			assert.strictEqual(result, 'shard0');
		});

		test('shards.get() returns data provider', async () => {
			const result = await run('typeof (await shards.get("shard0")).data.get');
			assert.strictEqual(result, 'function');
		});

		test('shards.get() rooms.list() matches default rooms.list()', async () => {
			const defaultResult = await run('JSON.stringify(await rooms.list())');
			const shardResult = await run('JSON.stringify(await (await shards.get("shard0")).rooms.list())');
			assert.strictEqual(shardResult, defaultResult);
		});

		test('shards.get() system.getTickDuration returns a number', async () => {
			const result = await run('(await shards.get("shard0")).system.getTickDuration()');
			assert.ok(!Number.isNaN(Number(result)));
		});

		test('shards.get() with invalid name returns error', async () => {
			const result = await run('await shards.get("nonexistent")');
			assert.ok(result.includes('Error'));
		});
	});

	describe('User helpers', () => {
		test('users.findByName returns userId', async () => {
			assert.strictEqual(await run('users.findByName("Player 1")'), '100');
		});

		test('users.info returns user hash', async () => {
			const result = await run('users.info("100")');
			assert.ok(result.includes('Player 1'));
		});

		test('users.findByName returns null for non-existent user', async () => {
			assert.strictEqual(await run('users.findByName("Nobody")'), 'null');
		});
	});
});

// Socket integration tests
const testSocketPath = path.join(os.tmpdir(), `xxscreeps-test-${process.pid}.sock`);

function sendCommand(testPath: string, expression: string): Promise<{ result?: string; error?: string }> {
	return new Promise((resolve, reject) => {
		const client = net.connect({ path: testPath }, () => {
			client.write(JSON.stringify({ expression }) + '\n');
		});
		let buffer = '';
		client.on('data', chunk => {
			buffer += chunk.toString();
			const newline = buffer.indexOf('\n');
			if (newline !== -1) {
				const line = buffer.slice(0, newline);
				client.destroy();
				resolve(JSON.parse(line) as { result?: string; error?: string });
			}
		});
		client.on('error', reject);
	});
}

// Smoke tests spawn many child processes; Node adds an exit handler per child
process.setMaxListeners(20);

// Ensure cleanup runs even if the test filter skips the Socket describe block
const socketCleanup = await startSocketServer(db, shard, testSocketPath, () => {});
process.on('beforeExit', () => {
	socketCleanup();
	shard.disconnect();
	db.disconnect();
});

describe('Socket', () => {

	describe('Protocol', () => {
		test('expression returns result', async () => {
			const response = await sendCommand(testSocketPath, '1 + 1');
			assert.strictEqual(response.result, '2');
		});

		test('string result returned as-is', async () => {
			const response = await sendCommand(testSocketPath, '"hello"');
			assert.strictEqual(response.result, 'hello');
		});

		test('async expression resolves', async () => {
			const response = await sendCommand(testSocketPath, 'await Promise.resolve(42)');
			assert.strictEqual(response.result, '42');
		});

		test('runtime error returns stack trace in result', async () => {
			const response = await sendCommand(testSocketPath, 'throw new Error("boom")');
			assert.ok(response.result?.includes('Error: boom'));
		});

		test('invalid JSON returns error field', async () => {
			const response = await new Promise<{ result?: string; error?: string }>((resolve, reject) => {
				const client = net.connect({ path: testSocketPath }, () => {
					client.write('not json\n');
				});
				let buffer = '';
				client.on('data', chunk => {
					buffer += chunk.toString();
					const newline = buffer.indexOf('\n');
					if (newline !== -1) {
						client.destroy();
						resolve(JSON.parse(buffer.slice(0, newline)) as { result?: string; error?: string });
					}
				});
				client.on('error', reject);
			});
			assert.ok(response.error !== undefined);
		});

		test('helpers available through socket', async () => {
			const response = await sendCommand(testSocketPath, 'JSON.stringify(await rooms.list())');
			const rooms = JSON.parse(response.result!) as string[];
			assert.ok(Array.isArray(rooms));
			assert.ok(rooms.length > 0);
		});

		test('db provider returns real data', async () => {
			const response = await sendCommand(testSocketPath, 'await db.smembers("users")');
			assert.ok(response.result?.includes('100'));
		});

		test('shard provider returns game time', async () => {
			const response = await sendCommand(testSocketPath, 'await shard.get("time")');
			assert.ok(response.result !== 'undefined');
			assert.ok(response.result !== 'null');
		});

		test('storage aliases are functional', async () => {
			const response = await sendCommand(testSocketPath, 'typeof storage.pubsub.publish');
			assert.strictEqual(response.result, 'function');
		});

		test('help() returns usage string', async () => {
			const response = await sendCommand(testSocketPath, 'help()');
			assert.ok(response.result?.includes('rooms'));
			assert.ok(response.result?.includes('system'));
		});
	});

	describe('Sequential processing', () => {
		test('responses arrive in order', async () => {
			const results = await new Promise<string[]>((resolve, reject) => {
				const client = net.connect({ path: testSocketPath }, () => {
					client.write(JSON.stringify({ expression: '"first"' }) + '\n');
					client.write(JSON.stringify({ expression: '"second"' }) + '\n');
					client.write(JSON.stringify({ expression: '"third"' }) + '\n');
				});
				const responses: string[] = [];
				let buffer = '';
				client.on('data', chunk => {
					buffer += chunk.toString();
					let newline;
					while ((newline = buffer.indexOf('\n')) !== -1) {
						const line = buffer.slice(0, newline);
						buffer = buffer.slice(newline + 1);
						responses.push((JSON.parse(line) as { result: string }).result);
						if (responses.length === 3) {
							client.destroy();
							resolve(responses);
						}
					}
				});
				client.on('error', reject);
			});
			assert.deepStrictEqual(results, [ 'first', 'second', 'third' ]);
		});
	});

	describe('Concurrent clients', () => {
		test('two clients receive independent responses', async () => {
			const [ first, second ] = await Promise.all([
				sendCommand(testSocketPath, '"from-a"'),
				sendCommand(testSocketPath, '"from-b"'),
			]);
			assert.strictEqual(first.result, 'from-a');
			assert.strictEqual(second.result, 'from-b');
		});

		test('shared state is visible across clients', async () => {
			const [ first, second ] = await Promise.all([
				sendCommand(testSocketPath, 'JSON.stringify(await rooms.list())'),
				sendCommand(testSocketPath, 'JSON.stringify(await rooms.list())'),
			]);
			assert.strictEqual(first.result, second.result);
		});

		test('state mutation on one client is visible to another', async () => {
			// Use persistent connections so destroying a one-shot sendCommand
			// doesn't release the pause lock before the second check.
			const first = await openConnection(testSocketPath);
			const second = await openConnection(testSocketPath);
			try {
				const pause = await first.send('system.pauseSimulation()');
				assert.strictEqual(pause.result, 'Simulation paused');

				const duplicate = await second.send('system.pauseSimulation()');
				assert.strictEqual(duplicate.result, 'Simulation is already paused');

				const resume = await first.send('system.resumeSimulation()');
				assert.strictEqual(resume.result, 'Simulation resumed');
			} finally {
				await Promise.all([ first.destroy(), second.destroy() ]);
			}
		});
	});

	describe('Persistent sessions', () => {
		test('variables persist on one connection and stay isolated from other clients', async () => {
			const first = await openConnection(testSocketPath);
			const second = await openConnection(testSocketPath);
			try {
				assert.strictEqual((await first.send('var persisted = 123; persisted')).result, '123');
				assert.strictEqual((await first.send('persisted')).result, '123');
				assert.strictEqual((await second.send('typeof persisted')).result, 'undefined');
			} finally {
				await Promise.all([ first.destroy(), second.destroy() ]);
			}
		});
	});

	describe('Lifecycle', () => {
		test('abrupt client disconnect does not crash the server', async () => {
			// Send a slow command, then destroy the socket before the response arrives.
			// Before the EPIPE fix, this crashed the server with an unhandled 'error' event.
			const socket = net.connect({ path: testSocketPath });
			await once(socket, 'connect');
			// Fire a command that will take a moment (async + inspect overhead)
			socket.write(JSON.stringify({ expression: 'await new Promise(r => setTimeout(r, 50)); "slow"' }) + '\n');
			// Destroy immediately — server will try to write back to a dead socket
			socket.destroy();
			await once(socket, 'close');
			// Give the server a tick to process the queued response write
			await delay(200);
			// If the server is still alive, this will succeed
			const probe = await sendCommand(testSocketPath, '"alive"');
			assert.strictEqual(probe.result, 'alive');
		});

		test('disconnecting a client releases any pause lock owned by its sandbox', async () => {
			// Pause on one connection, then disconnect it
			const client = await openConnection(testSocketPath);
			try {
				assert.strictEqual((await client.send('system.pauseSimulation()')).result, 'Simulation paused');
			} finally {
				await client.destroy();
			}

			// The disconnect should release the pause lock asynchronously.
			// Use a persistent connection to avoid sendCommand's close-on-response
			// releasing the pause again immediately.
			const verifier = await openConnection(testSocketPath);
			try {
				let pause: SocketResponse | undefined;
				const deadline = Date.now() + 1000;
				while (Date.now() < deadline) {
					pause = await verifier.send('system.pauseSimulation()');
					if (pause.result === 'Simulation paused') {
						break;
					}
					await delay(25);
				}
				assert.strictEqual(pause?.result, 'Simulation paused');
				assert.strictEqual((await verifier.send('system.resumeSimulation()')).result, 'Simulation resumed');
			} finally {
				await verifier.destroy();
			}
		});
	});

	describe('Smoke', () => {
		test('launcher start boots the legacy cli mod path and serves rooms.load through the socket client', async () => {
			const env = await createSmokeEnvironment();
			const server = spawnEntry(env.root, [ 'start', '--no-backend', '--no-processor', '--no-runner' ]);
			try {
				await waitForSocketReady(env.socketPath, server);

				const snapshot = await sendCommand(env.socketPath, 'JSON.stringify(await rooms.load("W9N9"))');
				assert.ok(snapshot.result?.includes('"type":"controller"'));
				assert.ok(snapshot.result?.includes('"type":"source"'));

				const client = await runEntry(env.root, [], 'help()\nexit\n');
				assert.strictEqual(client.code, 0, client.stderr);
				assert.ok(client.stdout.includes('Connected to xxscreeps server.'));
				assert.ok(client.stdout.includes('rooms.load(name)'));
			} finally {
				await stopEntry(server);
				await env.cleanup();
			}
		});

		test('offline cli loads seeded room data through the standalone entrypoint', async () => {
			const env = await createSmokeEnvironment();
			try {
				const cli = await runEntry(env.root, [ 'cli' ], 'JSON.stringify(await rooms.load("W9N9"))\nexit\n');
				assert.strictEqual(cli.code, 0, cli.stderr);
				assert.ok(cli.stdout.includes('xxscreeps CLI (offline'));
				assert.ok(cli.stdout.includes('"type":"controller"'));
				assert.ok(cli.stdout.includes('"type":"source"'));
			} finally {
				await env.cleanup();
			}
		});

		test('backend saves file-backed database changes on graceful shutdown', async () => {
			const port = await getFreePort();
			const env = await createSmokeEnvironment({
				configLines: [
					'backend:',
					`  bind: 127.0.0.1:${port}`,
					'  allowEmailRegistration: true',
				],
				mods: [
					'xxscreeps/mods/classic',
					'xxscreeps/mods/backend/password',
				],
			});
			const server = spawnEntry(env.root, [ 'backend' ]);
			try {
				await waitForHttpReady(`http://127.0.0.1:${port}/api/game/tick`, server);

				const response = await fetch(`http://127.0.0.1:${port}/api/register/submit`, {
					method: 'POST',
					headers: {
						'content-type': 'application/json',
					},
					body: JSON.stringify({
						email: 'persist@example.com',
						password: 'hunter22',
						username: 'PersistUser',
					}),
				});
				const body = await response.json() as Record<string, unknown>;
				assert.strictEqual(response.status, 200, JSON.stringify(body));
				assert.deepStrictEqual(body, { ok: 1 });
			} finally {
				await stopEntry(server);
			}

			const verifyDb = await Database.connect({
				data: env.databasePath,
				pubsub: 'local://verify-db',
			});
			try {
				const userId = await User.findUserByName(verifyDb, 'PersistUser');
				assert.ok(userId);
				assert.strictEqual(await User.providerIdForUser(verifyDb, 'email', userId), 'persist@example.com');
			} finally {
				verifyDb.disconnect();
				await env.cleanup();
			}
		});

		test('launcher start persists backend database changes on graceful shutdown', async () => {
			const port = await getFreePort();
			const env = await createSmokeEnvironment({
				configLines: [
					'backend:',
					`  bind: 127.0.0.1:${port}`,
					'  allowEmailRegistration: true',
				],
				mods: [
					'xxscreeps/mods/classic',
					'xxscreeps/mods/backend/password',
					'xxscreeps/mods/cli',
				],
				singleThreaded: false,
			});
			const server = spawnEntry(env.root, [ 'start' ]);
			try {
				await waitForHttpReady(`http://127.0.0.1:${port}/api/game/tick`, server);

				const response = await fetch(`http://127.0.0.1:${port}/api/register/submit`, {
					method: 'POST',
					headers: {
						'content-type': 'application/json',
					},
					body: JSON.stringify({
						email: 'persist-start@example.com',
						password: 'hunter22',
						username: 'PersistStartUser',
					}),
				});
				const body = await response.json() as Record<string, unknown>;
				assert.strictEqual(response.status, 200, JSON.stringify(body));
				assert.deepStrictEqual(body, { ok: 1 });
			} finally {
				await stopEntry(server);
			}

			const verifyDb = await Database.connect({
				data: env.databasePath,
				pubsub: 'local://verify-start-db',
			});
			try {
				const userId = await User.findUserByName(verifyDb, 'PersistStartUser');
				assert.ok(userId);
				assert.strictEqual(await User.providerIdForUser(verifyDb, 'email', userId), 'persist-start@example.com');
			} finally {
				verifyDb.disconnect();
				await env.cleanup();
			}
		});

		test('launcher shutdown persists shard progress in multi-threaded mode', async () => {
			const env = await createSmokeEnvironment({
				mods: [ 'xxscreeps/mods/classic' ],
				singleThreaded: false,
			});
			const server = spawnEntry(env.root, [ 'start', '--no-backend' ]);
			try {
				await waitForOutput(server, /Tick 2 ran/);
			} finally {
				await stopEntry(server);
			}

			const verifyDb = await Database.connect({
				data: env.databasePath,
				pubsub: 'local://verify-main-db',
			});
			const verifyShard = await Shard.connectWith(verifyDb, {
				name: 'shard0',
				data: env.shardPath,
				pubsub: 'local://verify-main-shard',
				scratch: 'local://verify-main-scratch',
			});
			try {
				assert.ok(verifyShard.time >= 2, `expected persisted time >= 2, got ${verifyShard.time}`);
			} finally {
				verifyShard.disconnect();
				verifyDb.disconnect();
				await env.cleanup();
			}
		});

		test('launcher shutdown with cli mod does not race file-backed keyval saves', async () => {
			const env = await createSmokeEnvironment({
				mods: [
					'xxscreeps/mods/classic',
					'xxscreeps/mods/cli',
				],
				singleThreaded: false,
			});
			const server = spawnEntry(env.root, [ 'start', '--no-backend' ]);
			try {
				await waitForOutput(server, /Tick 2 ran/);
			} finally {
				await stopEntry(server);
			}
			try {
				assert.strictEqual(server.child.exitCode, 0, `stdout:\n${server.stdout()}\nstderr:\n${server.stderr()}`);
				assert.ok(!server.stderr().includes('ENOENT'), server.stderr());
				assert.ok(!server.stderr().includes('.data.json.swp'), server.stderr());
			} finally {
				await env.cleanup();
			}
		});
	});

	describe('Cleanup', () => {
		test('stop socket server', () => {
			socketCleanup();
		});

		test('socket is closed after cleanup', async () => {
			await new Promise<void>((resolve, reject) => {
				const client = net.connect({ path: testSocketPath });
				client.on('error', () => resolve());
				client.on('connect', () => {
					client.destroy();
					reject(new Error('Should not connect after cleanup'));
				});
			});
		});
	});
});
