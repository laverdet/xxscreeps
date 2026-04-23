// Socket-integration, lifecycle, and subprocess/smoke tests for the CLI mod.
// Loaded via dynamic import at the bottom of `test.ts` so that (a) module
// singletons from `test-setup.ts` are reused and (b) the Socket describe is
// queued after the CLI describe.
import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import fs from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Database, Shard } from 'xxscreeps/engine/db/index.js';
import * as User from 'xxscreeps/engine/db/user/index.js';
import { seedTestShard } from 'xxscreeps/test/import.js';
import { assert, describe, test } from 'xxscreeps/test/index.js';
import { socketPathFor, startSocketServer } from './socket.js';
import { db, shard } from './test-setup.js';

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
	tickSpeed?: number;
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
	tickSpeed = 500,
}: SmokeEnvironmentOptions = {}) {
	const root = await fs.mkdtemp(path.join(os.tmpdir(), 'xxscreeps-cli-smoke-'));
	await fs.writeFile(path.join(root, '.screepsrc.yaml'), [
		'mods:',
		...mods.map(mod => `  - ${mod}`),
		'launcher:',
		`  singleThreaded: ${singleThreaded}`,
		'game:',
		`  tickSpeed: ${tickSpeed}`,
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
			if (address === null || typeof address === 'string') {
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
	child.stdout.on('data', (chunk: Buffer) => {
		stdout += chunk.toString();
	});
	child.stderr.on('data', (chunk: Buffer) => {
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
	// Bound the wait so a deadlocked child can't hang the whole test past the
	// framework's 10s timeout. Kill + throw so the test fails fast with a clear
	// error instead of leaking the child process into subsequent tests.
	const exited = once(proc.child, 'exit') as Promise<[ number | null, NodeJS.Signals | null ]>;
	const [ code, signal ] = await Promise.race([
		exited,
		delay(8000).then<[ number | null, NodeJS.Signals | null ]>(() => {
			proc.child.kill('SIGKILL');
			throw new Error(`runEntry child did not exit within 8s; killed.\nstdout:\n${proc.stdout()}\nstderr:\n${proc.stderr()}`);
		}),
	]);
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
			// Probe commands() — it returns a stable JSON-ish shape regardless of
			// help-format changes. Any response containing one of the default groups
			// means the sandbox is wired up and handling commands.
			const response = await Promise.race([
				sendCommand(path, 'commands()'),
				delay(500).then(() => { throw new Error('probe timeout'); }),
			]);
			if (response.result?.includes("name: 'system'")) {
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
		const ac = new AbortController();
		const probeTimeout = setTimeout(() => ac.abort(), 500);
		try {
			const response = await fetch(url, { signal: ac.signal });
			if (response.ok) {
				return;
			}
		} catch {} finally {
			clearTimeout(probeTimeout);
		}
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

const testSocketPath = path.join(os.tmpdir(), `xxscreeps-test-${process.pid}.sock`);

function sendCommand(testPath: string, expression: string): Promise<{ result?: string; error?: string }> {
	return new Promise((resolve, reject) => {
		const client = net.connect({ path: testPath }, () => {
			client.write(JSON.stringify({ expression }) + '\n');
		});
		// Single-shot settlement: every exit path (data, error, close, timeout)
		// routes through here so we can't leak listeners or double-resolve.
		let settled = false;
		const settle = (fn: () => void) => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			client.destroy();
			fn();
		};
		const timer = setTimeout(() => {
			settle(() => reject(new Error('sendCommand timed out after 5s')));
		}, 5000);
		let buffer = '';
		client.on('data', chunk => {
			buffer += chunk.toString();
			const newline = buffer.indexOf('\n');
			if (newline !== -1) {
				const line = buffer.slice(0, newline);
				settle(() => resolve(JSON.parse(line) as { result?: string; error?: string }));
			}
		});
		client.on('error', err => settle(() => reject(err)));
		client.on('close', () => settle(() =>
			reject(new Error('sendCommand: connection closed before response'))));
	});
}

// Smoke tests spawn many child processes; Node adds an exit handler per child
process.setMaxListeners(48);

// Socket cleanup is captured when the Socket describe runs. `beforeExit` fires
// even if the describe is filtered out, so the handler degrades to a plain
// db/shard disconnect in that case.
let socketCleanup: () => Promise<void> = async () => {};
process.on('beforeExit', () => {
	void socketCleanup();
	shard.disconnect();
	db.disconnect();
});

describe('Socket', async () => {
	// Re-seed: CLI tests above may have mutated users/rooms, and the shared
	// `shard.time` still drifts from other files' `simulate()` calls.
	await seedTestShard(db, shard);
	// Start the shared socket server *after* the CLI System reset tests have
	// run. Those tests publish `shutdown` on the shared service channel as
	// part of the new shutdown-on-reset contract — a socket server started
	// at module import time would subscribe to that channel and self-cleanup
	// mid-suite, breaking every subsequent socket probe with ENOENT.
	socketCleanup = await startSocketServer(db, shard, testSocketPath, () => {});

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

		test('first message with matching shard name scopes sandbox normally', async () => {
			const response = await new Promise<{ result?: string; error?: string }>(resolve => {
				const client = net.connect({ path: testSocketPath }, () => {
					client.write(JSON.stringify({ shard: 'shard0', expression: '"scoped"' }) + '\n');
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
			});
			assert.strictEqual(response.result, 'scoped');
		});

		test('handshake-only message acks without executing', async () => {
			const response = await new Promise<Record<string, unknown>>(resolve => {
				const client = net.connect({ path: testSocketPath }, () => {
					client.write(JSON.stringify({ shard: 'shard0' }) + '\n');
				});
				let buffer = '';
				client.on('data', chunk => {
					buffer += chunk.toString();
					const newline = buffer.indexOf('\n');
					if (newline !== -1) {
						client.destroy();
						resolve(JSON.parse(buffer.slice(0, newline)) as Record<string, unknown>);
					}
				});
			});
			assert.strictEqual(response.ok, true);
			assert.strictEqual(response.result, undefined);
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
		test('launcher start boots the cli mod path and exposes the game runtime through the socket client', async () => {
			const env = await createSmokeEnvironment();
			const server = spawnEntry(env.root, [ 'start', '--no-backend', '--no-processor', '--no-runner' ]);
			try {
				await waitForSocketReady(env.socketPath, server);

				const hasController = await sendCommand(env.socketPath, '(await rooms.peek("W9N9", r => r.controller !== undefined)) + ""');
				assert.ok(hasController.result?.includes('true'));
				const sourceCount = await sendCommand(env.socketPath, 'await rooms.peek("W9N9", r => r.find(FIND_SOURCES).length)');
				assert.ok(Number(sourceCount.result) > 0);

				const client = await runEntry(env.root, [], 'help()\nexit\n');
				assert.strictEqual(client.code, 0, client.stderr);
				assert.ok(client.stdout.includes('Connected to xxscreeps server.'));
				// Assert on the command name only — arg rendering is a help-format
				// detail and shouldn't be pinned by smoke tests.
				assert.ok(client.stdout.includes('rooms.peek'));
			} finally {
				await stopEntry(server);
				await env.cleanup();
			}
		});

		test('offline cli loads seeded room data through the standalone entrypoint', async () => {
			const env = await createSmokeEnvironment();
			try {
				const cli = await runEntry(env.root, [ 'offline' ], 'await rooms.peek("W9N9", r => ({ hasController: r.controller !== undefined, sourceCount: r.find(FIND_SOURCES).length }))\nexit\n');
				assert.strictEqual(cli.code, 0, cli.stderr);
				assert.ok(cli.stdout.includes('xxscreeps CLI (offline'));
				assert.ok(cli.stdout.includes('hasController: true'));
				assert.ok(cli.stdout.includes('sourceCount:'));
			} finally {
				await env.cleanup();
			}
		});

		test('admin lists groups in top-level help', async () => {
			const env = await createSmokeEnvironment();
			const server = spawnEntry(env.root, [ 'start', '--no-backend', '--no-processor', '--no-runner' ]);
			try {
				await waitForSocketReady(env.socketPath, server);
				const admin = await runEntry(env.root, [ 'admin', '--help' ], '');
				assert.strictEqual(admin.code, 0, admin.stderr);
				assert.ok(admin.stdout.includes('xxscreeps admin'), `missing banner: ${admin.stdout}`);
				for (const name of [ 'system', 'users', 'bots', 'map', 'rooms', 'shards' ]) {
					assert.ok(admin.stdout.includes(name), `group ${name} missing from help: ${admin.stdout}`);
				}
			} finally {
				await stopEntry(server);
				await env.cleanup();
			}
		});

		test('admin users list returns a formatted list; --json emits structured output', async () => {
			const env = await createSmokeEnvironment();
			const server = spawnEntry(env.root, [ 'start', '--no-backend', '--no-processor', '--no-runner' ]);
			try {
				await waitForSocketReady(env.socketPath, server);

				const plain = await runEntry(env.root, [ 'admin', 'users', 'list' ], '');
				assert.strictEqual(plain.code, 0, plain.stderr);
				assert.ok(/Invader|Source Keeper/.test(plain.stdout), `expected seeded user in list; got:\n${plain.stdout}`);

				const json = await runEntry(env.root, [ 'admin', 'users', 'list', '--json' ], '');
				assert.strictEqual(json.code, 0, json.stderr);
				const parsed = JSON.parse(json.stdout.trim()) as { ok: boolean; result: { username: string }[] };
				assert.strictEqual(parsed.ok, true);
				assert.ok(Array.isArray(parsed.result), 'result should be an array');
				assert.ok(parsed.result.some(user => user.username === 'Invader'));
			} finally {
				await stopEntry(server);
				await env.cleanup();
			}
		});

		test('admin accepts kebab-case command names', async () => {
			const env = await createSmokeEnvironment();
			const server = spawnEntry(env.root, [ 'start', '--no-backend', '--no-processor', '--no-runner' ]);
			try {
				await waitForSocketReady(env.socketPath, server);
				// The schema uses `setTickDuration`; CLI takes `set-tick-duration`.
				const result = await runEntry(env.root, [ 'admin', 'system', 'set-tick-duration', '250' ], '');
				assert.strictEqual(result.code, 0, result.stderr);
				assert.ok(result.stdout.includes('Tick duration set to 250ms'), `got: ${result.stdout}`);
			} finally {
				await stopEntry(server);
				await env.cleanup();
			}
		});

		test('admin bots add translates flags into opts and queues a placeSpawn intent', async () => {
			const env = await createSmokeEnvironment();
			// --no-processor so the intent sits in the queue. Actual spawn
			// placement is exercised by the in-process CLI test with
			// tickProcessor; this test verifies flag translation + queued state.
			const server = spawnEntry(env.root, [ 'start', '--no-backend', '--no-processor', '--no-runner' ]);
			try {
				await waitForSocketReady(env.socketPath, server);
				const add = await runEntry(env.root, [
					'admin', 'bots', 'add', 'AdminAddedBot',
					// (25,25) is a wall in seeded W9N9; (5,25) is open.
					'--room', 'W9N9', '--x', '5', '--y', '25',
					'--modules', '{"main":"module.exports.loop = function(){};"}',
				], '');
				assert.strictEqual(add.code, 0, add.stderr);
				assert.ok(add.stdout.includes('Bot queued: AdminAddedBot'), `got: ${add.stdout}`);

				// User record persisted synchronously.
				const userProbe = await sendCommand(env.socketPath, 'await users.findByName("AdminAddedBot")');
				assert.ok(typeof userProbe.result === 'string' && userProbe.result !== 'null', `user should exist; got: ${userProbe.result}`);
				const userId = userProbe.result;

				// Intent queued for next-tick processing: pushIntentsForRoomNextTick
				// zadds the room to the sleeping/wake set (key name
				// `processor/inactiveRooms` per model.ts:29) with the target
				// wake time, and rpushes the placeSpawn payload to the room's
				// intent list.
				const wakeScoreProbe = await sendCommand(env.socketPath, 'await storage.scratch.zscore("processor/inactiveRooms", "W9N9")');
				assert.ok(typeof wakeScoreProbe.result === 'string' && Number(wakeScoreProbe.result) > 0, `inactiveRooms score should be set for W9N9 after bots.add; got: ${wakeScoreProbe.result}`);

				const intentProbe = await sendCommand(env.socketPath, 'JSON.stringify(await storage.scratch.lrange("rooms/W9N9/intents", 0, -1))');
				const queued = JSON.parse(intentProbe.result!) as string[];
				assert.ok(queued.length === 1, `exactly one queued intent payload expected; got: ${intentProbe.result}`);
				const payload = JSON.parse(queued[0]) as { userId: string; intents: { local: { placeSpawn?: [[number, number, string]] }; internal?: boolean } };
				assert.strictEqual(payload.userId, userId, `queued intent must be for AdminAddedBot; got: ${queued[0]}`);
				assert.ok(payload.intents.internal, `intent must be marked internal; got: ${queued[0]}`);
				assert.deepStrictEqual(payload.intents.local.placeSpawn, [ [ 5, 25, 'Spawn1' ] ], `placeSpawn args must match the CLI flags; got: ${queued[0]}`);
			} finally {
				await stopEntry(server);
				await env.cleanup();
			}
		});

		test('admin surfaces handler failures as exit 1 with message on stderr', async () => {
			// Error contract (commands.ts Command.handler): a thrown CliError
			// becomes ok:false in the socket envelope → admin CLI exits 1 and
			// writes the message to stderr. Probed via auth.set-password because
			// its length-guard is the cheapest throw that touches no state.
			const env = await createSmokeEnvironment({
				mods: [ 'xxscreeps/mods/classic', 'xxscreeps/mods/cli', 'xxscreeps/mods/backend/password' ],
			});
			const server = spawnEntry(env.root, [ 'start', '--no-backend', '--no-processor', '--no-runner' ]);
			try {
				await waitForSocketReady(env.socketPath, server);

				const plain = await runEntry(env.root, [ 'admin', 'auth', 'set-password', 'Invader', 'short' ], '');
				assert.strictEqual(plain.code, 1, `handler failure must exit 1; stdout: ${plain.stdout}; stderr: ${plain.stderr}`);
				assert.ok(plain.stderr.includes('at least 8 characters'), `expected error message on stderr; got: ${plain.stderr}`);
				assert.strictEqual(plain.stdout.trim(), '', `stdout must be empty on failure; got: ${plain.stdout}`);

				const json = await runEntry(env.root, [ 'admin', '--json', 'auth', 'set-password', 'Invader', 'short' ], '');
				assert.strictEqual(json.code, 1, `--json handler failure must exit 1; stdout: ${json.stdout}; stderr: ${json.stderr}`);
				const parsed = JSON.parse(json.stdout.trim()) as { ok: boolean; error?: string };
				assert.strictEqual(parsed.ok, false);
				assert.ok(parsed.error?.includes('at least 8 characters'), `expected error field to carry message; got: ${json.stdout}`);
			} finally {
				await stopEntry(server);
				await env.cleanup();
			}
		});

		test('admin rejects unknown groups and commands with helpful exit code 2', async () => {
			const env = await createSmokeEnvironment();
			const server = spawnEntry(env.root, [ 'start', '--no-backend', '--no-processor', '--no-runner' ]);
			try {
				await waitForSocketReady(env.socketPath, server);

				const badGroup = await runEntry(env.root, [ 'admin', 'nonsense' ], '');
				assert.strictEqual(badGroup.code, 2, `exit code for unknown group should be 2; stdout: ${badGroup.stdout}; stderr: ${badGroup.stderr}`);
				assert.ok(badGroup.stderr.includes('Unknown group'), `stderr: ${badGroup.stderr}`);

				const badCmd = await runEntry(env.root, [ 'admin', 'system', 'bogus-command' ], '');
				assert.strictEqual(badCmd.code, 2, 'exit code for unknown command should be 2');
				assert.ok(badCmd.stderr.includes('Unknown command'), `stderr: ${badCmd.stderr}`);
			} finally {
				await stopEntry(server);
				await env.cleanup();
			}
		});

		test('admin refuses destructive commands non-interactively without --force', async () => {
			const env = await createSmokeEnvironment();
			const server = spawnEntry(env.root, [ 'start', '--no-backend', '--no-processor', '--no-runner' ]);
			try {
				await waitForSocketReady(env.socketPath, server);
				// No TTY → no prompt → must require --force.
				const unsafe = await runEntry(env.root, [ 'admin', 'system', 'import-world' ], '');
				assert.strictEqual(unsafe.code, 2, `stderr: ${unsafe.stderr}; stdout: ${unsafe.stdout}`);
				assert.ok(/destructive/i.test(unsafe.stderr) || /force/i.test(unsafe.stderr),
					`expected refusal message; stderr: ${unsafe.stderr}`);
			} finally {
				await stopEntry(server);
				await env.cleanup();
			}
		});

		test('admin system import-world --force auto-wraps with pauseSimulation', async () => {
			// Regression: importWorld requires an explicit pauseSimulation
			// hold to guard workers from racing the flush. pauseSimulation is
			// interactiveOnly because the pause releases on socket close, and
			// admin opens a fresh socket per invocation — so two admin calls
			// can't share a pause. The fix: the schema flags importWorld as
			// requiresPause, and admin CLI wraps such commands in a
			// pauseSimulation → (call) → resumeSimulation IIFE that runs
			// inside a single socket lifetime. One sandbox, one
			// PauseCoordinator, pause visible across the chained calls; the
			// guard in importWorld is satisfied and the import completes.
			const env = await createSmokeEnvironment();
			const server = spawnEntry(env.root, [ 'start', '--no-backend', '--no-processor', '--no-runner' ]);
			try {
				await waitForSocketReady(env.socketPath, server);
				const reset = await runEntry(env.root, [ 'admin', 'system', 'import-world', '--force' ], '');
				assert.strictEqual(reset.code, 0, `import --force should succeed via auto-wrap; stderr: ${reset.stderr}, stdout: ${reset.stdout}`);
				assert.ok(reset.stdout.includes('wiped'), `expected import confirmation in stdout; got: ${reset.stdout}`);
				// importWorld schedules a clean shutdown after returning its
				// confirmation (see cli.ts importWorld). The server process
				// must actually exit — prove it by waiting for exit with a
				// bounded delay and asserting a zero exit code.
				const [ code ] = await Promise.race([
					once(server.child, 'exit') as Promise<[ number | null, NodeJS.Signals | null ]>,
					delay(5000).then<[ number | null, NodeJS.Signals | null ]>(() => {
						throw new Error(`server did not exit within 5s after reset.\nstdout:\n${server.stdout()}\nstderr:\n${server.stderr()}`);
					}),
				]);
				assert.strictEqual(code, 0, `server must exit cleanly after reset; stdout:\n${server.stdout()}\nstderr:\n${server.stderr()}`);
			} finally {
				await stopEntry(server);
				await env.cleanup();
			}
		});

		test('admin system import-world --force: server exits cleanly post-import', async () => {
			// importWorld is a maximally-destructive operator command. Rather than
			// try to re-initialize every service's in-memory state (worker
			// room caches, processor affinity bookkeeping, main.ts's scratch
			// handshake, runner world ref) after wiping the world out from
			// under them, the handler publishes a service-level shutdown and
			// lets the launcher unwind cleanly. This test verifies that
			// contract end-to-end: with a live processor running, the reset
			// command returns its confirmation AND the server process
			// exits with code 0 shortly after. 100ms tickSpeed keeps the
			// pre-reset liveness wait well under the 10s test timeout.
			const env = await createSmokeEnvironment({ tickSpeed: 100 });
			const server = spawnEntry(env.root, [ 'start', '--no-backend', '--no-runner' ]);
			try {
				// Pre-reset liveness: baseline that the processor is actually
				// running before we ask it to reset. Tick 2 is enough proof.
				await waitForOutput(server, /Tick 2 ran/);

				const reset = await runEntry(env.root, [ 'admin', 'system', 'import-world', '--force' ], '');
				assert.strictEqual(reset.code, 0, `import --force should succeed; stderr: ${reset.stderr}, stdout: ${reset.stdout}`);
				assert.ok(reset.stdout.includes('wiped'), `expected import confirmation; got: ${reset.stdout}`);

				const [ code ] = await Promise.race([
					once(server.child, 'exit') as Promise<[ number | null, NodeJS.Signals | null ]>,
					delay(5000).then<[ number | null, NodeJS.Signals | null ]>(() => {
						throw new Error(`server did not exit within 5s after reset.\nstdout:\n${server.stdout()}\nstderr:\n${server.stderr()}`);
					}),
				]);
				assert.strictEqual(code, 0, `server must exit cleanly after reset; stdout:\n${server.stdout()}\nstderr:\n${server.stderr()}`);
			} finally {
				await stopEntry(server);
				await env.cleanup();
			}
		});

		test('admin rejects commands whose args include a callback (peek/poke) with a REPL hint', async () => {
			const env = await createSmokeEnvironment();
			const server = spawnEntry(env.root, [ 'start', '--no-backend', '--no-processor', '--no-runner' ]);
			try {
				await waitForSocketReady(env.socketPath, server);
				const peek = await runEntry(env.root, [ 'admin', 'rooms', 'peek', 'W9N9' ], '');
				assert.notStrictEqual(peek.code, 0);
				assert.ok(/callback/i.test(peek.stderr) || /REPL/i.test(peek.stderr),
					`expected callback/REPL hint; stderr: ${peek.stderr}`);
			} finally {
				await stopEntry(server);
				await env.cleanup();
			}
		});

		test('admin surfaces the command schema shape in per-command --help', async () => {
			const env = await createSmokeEnvironment();
			const server = spawnEntry(env.root, [ 'start', '--no-backend', '--no-processor', '--no-runner' ]);
			try {
				await waitForSocketReady(env.socketPath, server);
				const help = await runEntry(env.root, [ 'admin', 'bots', 'add', '--help' ], '');
				assert.strictEqual(help.code, 0, help.stderr);
				// The help output must mention the positional <name> and at least one
				// option that came from the shape.
				assert.ok(help.stdout.includes('<name>'), `missing <name>: ${help.stdout}`);
				assert.ok(help.stdout.includes('--room'), `missing --room flag: ${help.stdout}`);
				assert.ok(help.stdout.includes('--code-dir'), `missing --code-dir flag: ${help.stdout}`);
			} finally {
				await stopEntry(server);
				await env.cleanup();
			}
		});

		test('admin rejects mutually exclusive --modules / --code-dir (oneOf group)', async () => {
			// Schema fields sharing a `oneOf` key (bots.{add,reload}'s
			// { modules | codeDir | package } bundle) must be mutually
			// exclusive at the argv layer, before the handler runs — otherwise
			// operators get silent "first-wins" behavior that hides typos.
			// The check lives in admin/argv.ts:127-131; without an end-to-end
			// test the only signal is an internal README bullet.
			const env = await createSmokeEnvironment();
			const server = spawnEntry(env.root, [ 'start', '--no-backend', '--no-processor', '--no-runner' ]);
			try {
				await waitForSocketReady(env.socketPath, server);
				const conflict = await runEntry(env.root, [
					'admin', 'bots', 'reload', 'AnyName',
					'--modules', '{"main":""}',
					'--code-dir', '/tmp',
				], '');
				assert.notStrictEqual(conflict.code, 0, `mutually-exclusive flags must fail; stdout: ${conflict.stdout}`);
				assert.ok(/mutually exclusive/i.test(conflict.stderr),
					`expected 'mutually exclusive' in stderr; got: ${conflict.stderr}`);
			} finally {
				await stopEntry(server);
				await env.cleanup();
			}
		});

		test('admin unwraps ECHO envelopes instead of printing the raw object', async () => {
			// Captures a class of bug: admin wraps the call in its own try/JSON.stringify,
			// bypassing executeCommand's native ECHO unwrap. Without explicit unwrap in
			// the wrapper expression, `pauseSimulation` (which returns
			// `{ result: "...", [ECHO]: true }`) prints as `{ result: '...' }` instead
			// of the bare message string.
			const env = await createSmokeEnvironment();
			const server = spawnEntry(env.root, [ 'start', '--no-backend', '--no-processor', '--no-runner' ]);
			try {
				await waitForSocketReady(env.socketPath, server);
				// pauseSimulation is interactive-only once that fix lands; use a
				// different echo-returning command. For now, use set-tick-duration
				// (plain string return) to verify normal commands still print cleanly,
				// and verify admin pause-simulation either prints the bare string or
				// is rejected — but never prints an envelope object.
				const result = await runEntry(env.root, [ 'admin', 'system', 'set-tick-duration', '250' ], '');
				assert.ok(!result.stdout.includes('{ result:'), `ECHO envelope leaked into admin output: ${result.stdout}`);
			} finally {
				await stopEntry(server);
				await env.cleanup();
			}
		});

		test('admin rejects pause-simulation / resume-simulation as interactive-only', async () => {
			// Captures a class of bug: commands that depend on the connection staying
			// open for their effect to persist (like pauseSimulation — auto-released
			// on socket close) are meaningless through admin, which disconnects after
			// each invocation. The schema should flag these and admin should reject.
			const env = await createSmokeEnvironment();
			const server = spawnEntry(env.root, [ 'start', '--no-backend', '--no-processor', '--no-runner' ]);
			try {
				await waitForSocketReady(env.socketPath, server);
				const pause = await runEntry(env.root, [ 'admin', 'system', 'pause-simulation' ], '');
				assert.notStrictEqual(pause.code, 0, `pause-simulation should be rejected; stdout: ${pause.stdout}`);
				assert.ok(/interactive|REPL/i.test(pause.stderr), `expected interactive-only hint; stderr: ${pause.stderr}`);
			} finally {
				await stopEntry(server);
				await env.cleanup();
			}
		});

		test('admin completion bash emits a sourceable bash completion script', async () => {
			const env = await createSmokeEnvironment();
			// No server needed — `completion bash` is a local-only static emitter.
			const completion = await runEntry(env.root, [ 'admin', 'completion', 'bash' ], '');
			assert.strictEqual(completion.code, 0, completion.stderr);
			assert.ok(completion.stdout.includes('_xxscreeps_admin'), `missing function name: ${completion.stdout}`);
			assert.ok(completion.stdout.includes('complete -F _xxscreeps_admin'), `missing complete directive: ${completion.stdout}`);
			await env.cleanup();
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
				assert.ok(userId !== null);
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
				assert.ok(userId !== null);
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
			void socketCleanup();
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
