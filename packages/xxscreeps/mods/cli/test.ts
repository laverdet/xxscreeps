import type { InvalidationMessage } from 'xxscreeps/engine/service/invalidation.js';
import fs from 'node:fs/promises';
import os from 'node:os';
import Path from 'node:path';
import { getInvalidationChannel } from 'xxscreeps/engine/service/invalidation.js';
import { seedTestShard } from 'xxscreeps/test/import.js';
import { assert, describe, test } from 'xxscreeps/test/index.js';
import { resolveFromPackage, resolveModules } from './cli.js';
import { createSandbox, destroySandbox, executeCommand } from './sandbox.js';
import { db, pause, pushIntentForTest, shard, tickProcessor } from './test-setup.js';

// Shared sandbox for short `run()` calls. Tests that need isolation (pause
// semantics, persistent variables) should build their own via createSandbox.
const sharedSandbox = createSandbox(db, shard, pause);
const run = (expression: string) => executeCommand(sharedSandbox, expression);

describe('CLI', async () => {
	// Other test files' `simulate()` calls mutate `shard.time` in the shared
	// `local://` singleton; re-seed so these tests see `time=1` room blobs.
	await seedTestShard(db, shard);

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
			assert.ok(result.includes('Script execution timed out'), `expected sync timeout message, got: ${result}`);
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
			const sandbox = createSandbox(db, shard, pause);
			try {
				await executeCommand(sandbox, 'var foo = 123');
				assert.strictEqual(await executeCommand(sandbox, 'foo'), '123');
			} finally {
				await destroySandbox(sandbox);
			}
		});

		test('separate sandboxes are isolated', async () => {
			const sandboxA = createSandbox(db, shard, pause);
			const sandboxB = createSandbox(db, shard, pause);
			try {
				await executeCommand(sandboxA, 'var bar = 456');
				assert.strictEqual(await executeCommand(sandboxB, 'typeof bar'), 'undefined');
			} finally {
				await Promise.all([ destroySandbox(sandboxA), destroySandbox(sandboxB) ]);
			}
		});

		test('async output stays with the originating command', async () => {
			const sandbox = createSandbox(db, shard, pause);
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

		test('help() includes mod-registered help lines', async () => {
			const result = await run('help()');
			assert.ok(result.includes('system.pauseSimulation'));
			assert.ok(result.includes('shards.get'));
		});
	});

	describe('Extensibility', () => {
		test('built-in commands are registered via hooks', async () => {
			// All command groups are registered through the hook system, not hardcoded
			const sandbox = createSandbox(db, shard, pause);
			try {
				assert.strictEqual(await executeCommand(sandbox, 'typeof system.pauseSimulation'), 'function');
				assert.strictEqual(await executeCommand(sandbox, 'typeof rooms.list'), 'function');
				assert.strictEqual(await executeCommand(sandbox, 'typeof users.findByName'), 'function');
				assert.strictEqual(await executeCommand(sandbox, 'typeof shards.list'), 'function');
				assert.strictEqual(await executeCommand(sandbox, 'typeof storage.pubsub'), 'object');
			} finally {
				await destroySandbox(sandbox);
			}
		});

		test('third-party mods can register command groups via the cli hook', async () => {
			// auth.setPassword lives in mods/backend/password — its presence in the
			// sandbox confirms importMods('cli') picks up mods that declare
			// `provides: ['cli']` and that duplicate-named groups merge cleanly.
			const sandbox = createSandbox(db, shard, pause);
			try {
				assert.strictEqual(await executeCommand(sandbox, 'typeof auth.setPassword'), 'function');
			} finally {
				await destroySandbox(sandbox);
			}
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

		test('rooms.peek() runs task in game context and returns result', async () => {
			const result = await run('await rooms.peek("W5N5", r => r["#objects"].length)');
			assert.strictEqual(Number(result), 4);
		});

		test('rooms.peek() task has access to game objects with full API', async () => {
			const result = await run('JSON.stringify(await rooms.peek("W5N5", r => r.find(FIND_SOURCES).map(s => ({ id: s.id, x: s.pos.x, y: s.pos.y }))))');
			const sources = JSON.parse(result) as { id: string; x: number; y: number }[];
			assert.ok(sources.length > 0);
			for (const source of sources) {
				assert.ok(typeof source.id === 'string');
				assert.ok(typeof source.x === 'number');
				assert.ok(typeof source.y === 'number');
			}
		});

		test('rooms.peek() can query any find constant', async () => {
			const hasController = await run('(await rooms.peek("W9N9", r => r.controller !== undefined)) + ""');
			assert.strictEqual(hasController, 'true');
			const sourceCount = await run('await rooms.peek("W9N9", r => r.find(FIND_SOURCES).length)');
			assert.ok(Number(sourceCount) >= 1);
			const mineralCount = await run('await rooms.peek("W9N9", r => r.find(FIND_MINERALS).length)');
			assert.ok(Number(mineralCount) >= 1);
		});

		test('rooms.peek() exposes controller game properties', async () => {
			const result = await run('JSON.stringify(await rooms.peek("W9N9", r => ({ id: r.controller.id, level: r.controller.level, safeModeAvailable: r.controller.safeModeAvailable, structureType: r.controller.structureType })))');
			const controller = JSON.parse(result) as { id: string; level: number; safeModeAvailable: number; structureType: string };
			assert.ok(typeof controller.id === 'string');
			assert.ok(typeof controller.level === 'number');
			assert.ok(typeof controller.safeModeAvailable === 'number');
			assert.strictEqual(controller.structureType, 'controller');
		});

		test('rooms.peek() exposes Game object to task', async () => {
			const result = await run('await rooms.peek("W5N5", (r, Game) => Game.time)');
			assert.ok(Number.isFinite(Number(result)));
		});

		test('rooms.peek() with non-existent room throws', async () => {
			const result = await run('await rooms.peek("X9X9", r => r.name)');
			assert.ok(result.includes('Error'));
		});

		test('rooms.poke() mutates and saves room state', async () => {
			// Close an unused room, reopen, then use poke to add a construction site via runtime
			await run('await map.openRoom("W3N3")');
			const before = await run('await rooms.peek("W3N3", r => r["#objects"].length)');
			// Use poke to modify room; verify the change is visible on re-read
			const pokeResult = await run(`await rooms.poke("W3N3", "0", (r) => {
				r["#level"] = 5;
				return r["#level"];
			})`);
			assert.strictEqual(Number(pokeResult), 5);
			const after = await run('await rooms.peek("W3N3", r => r["#level"])');
			assert.strictEqual(Number(after), 5);
			// Room count unchanged
			const afterCount = await run('await rooms.peek("W3N3", r => r["#objects"].length)');
			assert.strictEqual(Number(before), Number(afterCount));
		});

		test('rooms.poke populates both double-buffer slots so opposite-parity reads see the mutation', async () => {
			// saveRoom only touches slot `shard.time % 2`. Without a follow-up
			// copyRoomFromPreviousTick, a reader at an opposite-parity tick
			// (sleeping room, paused sim, or a service that advances time
			// without running finalize) sees the pre-poke blob. poke matches
			// importWorld's pattern (scripts/import.ts) and copies forward so
			// both slots are coherent the moment the helper returns.
			await run('await map.openRoom("W3N3")');
			await run(`await rooms.poke("W3N3", "0", (r) => { r["#level"] = 9 })`);
			const currentSlot = shard.time % 2;
			const oppositeSlot = 1 - currentSlot;
			const currentBlob = await shard.data.get(`room${currentSlot}/W3N3`, { blob: true });
			const oppositeBlob = await shard.data.get(`room${oppositeSlot}/W3N3`, { blob: true });
			assert.ok(currentBlob, 'current-parity slot should exist after poke');
			assert.ok(oppositeBlob, 'opposite-parity slot should exist after poke — copyRoomFromPreviousTick must run');
			assert.deepStrictEqual(
				Buffer.from(oppositeBlob),
				Buffer.from(currentBlob),
				'both double-buffer slots should be byte-identical after poke',
			);
		});

		test('rooms.poke help text warns the write bypasses the processor pipeline', async () => {
			// Pin the remaining caveat in the visible schema. After the
			// copy-forward fix, the double-buffer divergence is gone, but poke
			// still skips intents, inter-room dispatch, and pre/tick
			// processors — the fundamental cost of an arbitrary-mutation
			// escape hatch. The schema's `description` is the only
			// user-visible docstring surface; if future cleanups drop the
			// warning, this test fails and the commit needs to relocate the
			// caveat before merging.
			const help = await run('help("poke")');
			assert.ok(
				/processor|intent/i.test(help),
				`expected poke help to mention processor/intent caveat; got: ${help}`,
			);
		});

		test('RoomPosition is available in sandbox', async () => {
			const result = await run('new RoomPosition(25, 25, "W5N5").roomName');
			assert.strictEqual(result, 'W5N5');
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

		test('system.setTickDuration persists the change to .screepsrc.yaml', async () => {
			// Captures a class of bug: commands that write files via configPath
			// (a URL, not a string). String-concatenating `.tmp` onto a URL and
			// passing the result to fs.writeFile produces ENOENT because the
			// `file://` prefix is treated as part of the path. The positive-path
			// assertion — "a successful call must return a confirmation string,
			// not a stack trace" — catches this and any similar future breakage.
			const { readFile, writeFile } = await import('node:fs/promises');
			const { configPath } = await import('xxscreeps/config/raw.js');
			const original = await readFile(configPath, 'utf8');
			try {
				const result = await run('system.setTickDuration(123)');
				assert.ok(
					result.includes('Tick duration set to 123ms'),
					`setTickDuration did not succeed; got: ${result}`,
				);
				const onDisk = await readFile(configPath, 'utf8');
				assert.ok(
					/tickSpeed:\s*123\b/.test(onDisk),
					`expected tickSpeed: 123 in config, got:\n${onDisk}`,
				);
			} finally {
				await writeFile(configPath, original, 'utf8');
			}
		});

		test('system.pauseSimulation acquires lock and returns confirmation', async () => {
			const sandbox = createSandbox(db, shard, pause);
			try {
				assert.strictEqual(await executeCommand(sandbox, 'system.pauseSimulation()'), 'Simulation paused');
			} finally {
				await destroySandbox(sandbox);
			}
		});

		test('system.pauseSimulation when already paused returns error', async () => {
			const sandbox = createSandbox(db, shard, pause);
			try {
				assert.strictEqual(await executeCommand(sandbox, 'system.pauseSimulation()'), 'Simulation paused');
				assert.strictEqual(await executeCommand(sandbox, 'system.pauseSimulation()'), 'Simulation is already paused');
			} finally {
				await destroySandbox(sandbox);
			}
		});

		test('system.resumeSimulation releases lock and returns confirmation', async () => {
			const sandbox = createSandbox(db, shard, pause);
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
			const sandboxA = createSandbox(db, shard, pause);
			const sandboxB = createSandbox(db, shard, pause);
			try {
				assert.strictEqual(await executeCommand(sandboxA, 'system.pauseSimulation()'), 'Simulation paused');
				await destroySandbox(sandboxA);
				assert.strictEqual(await executeCommand(sandboxB, 'system.pauseSimulation()'), 'Simulation paused');
				assert.strictEqual(await executeCommand(sandboxB, 'system.resumeSimulation()'), 'Simulation resumed');
			} finally {
				await Promise.all([ destroySandbox(sandboxA), destroySandbox(sandboxB) ]);
			}
		});

		test('concurrent pauseSimulation from two sessions does not leak a mutex', async () => {
			// Before the `acquiring` flag (P2-1), two concurrent callers could both
			// pass the `if (pause.mutex)` guard, each lock a mutex, and the second
			// assignment to `pause.mutex` would orphan the first.
			const sandboxA = createSandbox(db, shard, pause);
			const sandboxB = createSandbox(db, shard, pause);
			try {
				const [ resA, resB ] = await Promise.all([
					executeCommand(sandboxA, 'system.pauseSimulation()'),
					executeCommand(sandboxB, 'system.pauseSimulation()'),
				]);
				const outcomes = [ resA, resB ].sort();
				assert.strictEqual(outcomes[0], 'Simulation is already paused');
				assert.strictEqual(outcomes[1], 'Simulation paused');
				// Exactly one resume releases the lock; the other should report not paused.
				const [ rel1, rel2 ] = await Promise.all([
					executeCommand(sandboxA, 'system.resumeSimulation()'),
					executeCommand(sandboxB, 'system.resumeSimulation()'),
				]);
				const releases = [ rel1, rel2 ].sort();
				assert.strictEqual(releases[0], 'Simulation is not paused');
				assert.strictEqual(releases[1], 'Simulation resumed');
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

		// system.importWorld is tested in the System reset describe block (runs last)
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

		test('shards.get() with invalid name throws echoing the supplied name', async () => {
			const result = await run('await shards.get("nonexistent")');
			assert.ok(result.includes('nonexistent'), `expected supplied name in error; got: ${result}`);
		});

		test('shards.info() returns a CLI-friendly POJO summary', async () => {
			const result = await run('JSON.stringify(await shards.info("shard0"))');
			const info = JSON.parse(result) as { name: string; time: number; rooms: number };
			assert.strictEqual(info.name, 'shard0');
			assert.ok(typeof info.time === 'number');
			assert.ok(info.rooms >= 1, `expected at least one room; got: ${info.rooms}`);
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

	describe('User management', () => {
		test('users.list returns seeded users', async () => {
			const result = await run('JSON.stringify(await users.list())');
			const users = JSON.parse(result) as { id: string; username: string }[];
			assert.ok(users.length >= 5);
			assert.ok(users.some(user => user.username === 'Player 1'));
		});

		test('users.create creates a new user', async () => {
			const result = await run('await users.create("TestBot")');
			assert.ok(result.includes('User created: TestBot'));
			assert.ok(result.includes('('));
		});

		test('users.create attaches an email provider so web-client login flow does not dead-end', async () => {
			const result = await run('await users.create("EmailBot")');
			const match = /\(([a-f0-9]+)\)/.exec(result);
			assert.ok(match, `expected user id in result: ${result}`);
			const providersJson = await run(`JSON.stringify(await db.hgetall(\`user/${match[1]}/provider\`))`);
			const providers = JSON.parse(providersJson) as Record<string, string>;
			assert.ok(providers.email, `expected email provider, got: ${providersJson}`);
		});

		test('users.create rejects duplicate username', async () => {
			const result = await run('await users.create("TestBot")');
			assert.ok(result.includes('Already associated'), `expected 'Already associated', got: ${result}`);
		});

		test('users.create rejects invalid username', async () => {
			const result = await run('await users.create("a")');
			assert.ok(result.includes('Invalid username'));
		});

		test('created user is findable', async () => {
			const userId = await run('users.findByName("TestBot")');
			assert.ok(userId !== 'null');
			const info = await run(`users.info("${userId}")`);
			assert.ok(info.includes('TestBot'));
		});

		test('users.remove removes user by name', async () => {
			const result = await run('await users.remove("TestBot")');
			assert.ok(result.includes('Removed user: TestBot'));
		});

		test('removed user is gone', async () => {
			assert.strictEqual(await run('users.findByName("TestBot")'), 'null');
		});

		test('users.remove returns error for non-existent user', async () => {
			const result = await run('await users.remove("NonexistentUser")');
			assert.ok(result.includes('not found'));
		});
	});

	describe('Auth', () => {
		test('auth.setPassword rejects passwords under 8 characters', async () => {
			const result = await run('await auth.setPassword("Player 1", "short")');
			assert.ok(result.includes('at least 8 characters'), `expected length error, got: ${result}`);
		});

		test('auth.setPassword rejects non-string passwords', async () => {
			const result = await run('await auth.setPassword("Player 1", 12345678)');
			assert.ok(result.includes('at least 8 characters'), `expected length error, got: ${result}`);
		});

		test('auth.setPassword returns error for non-existent user', async () => {
			const result = await run('await auth.setPassword("NonexistentUser", "longEnoughPw")');
			assert.ok(result.includes('not found'), `expected 'not found', got: ${result}`);
		});

		test('auth.setPassword stores a hash that checkPassword later accepts', async () => {
			const { checkPassword } = await import('xxscreeps/mods/backend/password/model.js');
			const result = await run('await auth.setPassword("Player 1", "hunter2!abc")');
			assert.ok(result.includes('Password set for Player 1'), `expected success, got: ${result}`);
			assert.strictEqual(await checkPassword(db, '100', 'hunter2!abc'), true);
			assert.strictEqual(await checkPassword(db, '100', 'not-the-right-one'), false);
		});

		test('auth.setPassword overwrites on repeat calls', async () => {
			const { checkPassword } = await import('xxscreeps/mods/backend/password/model.js');
			await run('await auth.setPassword("Player 1", "first-password-1")');
			assert.strictEqual(await checkPassword(db, '100', 'first-password-1'), true);
			await run('await auth.setPassword("Player 1", "second-password-2")');
			assert.strictEqual(await checkPassword(db, '100', 'first-password-1'), false);
			assert.strictEqual(await checkPassword(db, '100', 'second-password-2'), true);
		});

		test('auth.setPassword accepts a userId directly (mirrors users.remove)', async () => {
			const { checkPassword } = await import('xxscreeps/mods/backend/password/model.js');
			const result = await run('await auth.setPassword("100", "by-id-pw-xyz")');
			assert.ok(result.includes('Password set for Player 1'), `expected success, got: ${result}`);
			assert.strictEqual(await checkPassword(db, '100', 'by-id-pw-xyz'), true);
		});
	});

	describe('Bot management', () => {
		test('bots.add creates user and queues placeSpawn intent', async () => {
			// W9N9 (25,25) is a natural wall in the seeded layout; (5,25) is open.
			const result = await run('await bots.add("BotPlayer", { room: "W9N9", x: 5, y: 25, modules: { main: "module.exports.loop = function(){}" } })');
			assert.ok(result.includes('Bot queued: BotPlayer'), `expected 'Bot queued: BotPlayer', got: ${result}`);
			assert.ok(result.includes('W9N9'));
		});

		test('bots.add user exists and has code', async () => {
			const userId = await run('users.findByName("BotPlayer")');
			assert.ok(userId !== 'null');
			const info = await run(`users.info("${userId}")`);
			assert.ok(info.includes('BotPlayer'));
		});

		test('bots.add spawn lands after the next processor tick', async () => {
			// bots.add pushes a placeSpawn intent; drive one processor tick to let
			// the canonical pipeline run it, mirroring what the live server's
			// main.ts loop does continuously.
			await tickProcessor();
			const result = await run('JSON.stringify(await rooms.peek("W9N9", r => r.find(FIND_STRUCTURES).filter(s => s.structureType === "spawn").map(s => ({ x: s.pos.x, y: s.pos.y }))))');
			const spawns = JSON.parse(result) as { x: number; y: number }[];
			assert.ok(spawns.length === 1, `spawn should exist in room after a tick; got: ${result}`);
			assert.strictEqual(spawns[0].x, 5);
			assert.strictEqual(spawns[0].y, 25);
		});

		test('bots.add rejects duplicate name', async () => {
			const result = await run('await bots.add("BotPlayer", { room: "W8N8", x: 25, y: 25, modules: { main: "" } })');
			assert.ok(result.includes('Already associated'), `expected 'Already associated', got: ${result}`);
		});

		test('bots.add rejects nonexistent room', async () => {
			const result = await run('await bots.add("Bot2", { room: "X99X99", x: 25, y: 25, modules: { main: "" } })');
			assert.ok(result.includes('does not exist'));
		});

		test('bots.add does not orphan the user when room is already owned', async () => {
			// W9N9 is owned by BotPlayer from earlier in this describe. Pos must be
			// non-wall or the terrain check fires before the ownership check.
			const result = await run('await bots.add("OrphanAttempt", { room: "W9N9", x: 6, y: 25, modules: { main: "" } })');
			assert.ok(result.includes('already owned'), `expected 'already owned', got: ${result}`);
			// User must not have been persisted — otherwise we'd have a dangling
			// `users/<id>` record with no claimed room.
			assert.strictEqual(await run('users.findByName("OrphanAttempt")'), 'null');
		});

		test('bots.add rejects missing opts', async () => {
			const result = await run('await bots.add("BotNoOpts")');
			assert.ok(result.includes('Usage: bots.add'), `expected usage hint, got: ${result}`);
		});

		test('bots.reload updates code', async () => {
			const result = await run('await bots.reload("BotPlayer", { modules: { main: "module.exports.loop = function(){ /* v2 */ }" } })');
			assert.ok(result.includes('Code reloaded'));
			assert.ok(result.includes('1 modules'));
		});

		test('bots.reload rejects unknown user', async () => {
			const result = await run('await bots.reload("Nobody", { modules: { main: "" } })');
			assert.ok(result.includes('not found'));
		});

		test('bots.reload rejects missing opts', async () => {
			const result = await run('await bots.reload("BotPlayer")');
			assert.ok(result.includes('Usage: bots.reload'), `expected usage hint, got: ${result}`);
		});

		test('bots.reload rejects empty opts', async () => {
			const result = await run('await bots.reload("BotPlayer", {})');
			assert.ok(result.includes('Usage: bots.reload'), `expected usage hint, got: ${result}`);
		});

		test('bots.remove cleans user and rooms', async () => {
			const result = await run('await bots.remove("BotPlayer")');
			assert.ok(result.includes('Removed bot: BotPlayer'));
			assert.ok(result.includes('W9N9'));
		});

		test('bots.remove user is gone', async () => {
			assert.strictEqual(await run('users.findByName("BotPlayer")'), 'null');
		});

		test('bots.remove spawn is gone from room after the next processor tick', async () => {
			// bots.remove queues an unspawn intent; the canonical pipeline fires on
			// the next processor tick via mods/spawn/processor.ts — spawn becomes a
			// ruin (see "converts owned structures to ruins") and is removed from
			// FIND_STRUCTURES. Without a tick the spawn stays in place.
			await tickProcessor();
			const result = await run('await rooms.peek("W9N9", r => r.find(FIND_STRUCTURES).filter(s => s.structureType === "spawn").length)');
			assert.strictEqual(Number(result), 0, 'spawn should be removed');
		});

		test('bots.remove preserves the controller (resets it, does not delete)', async () => {
			// Captures a class of bug: cleanUserOwnedRooms iterates #objects and
			// removes every one whose #user matches the removed user — including
			// the controller, whose #user was set by bots.add as the *claim*.
			// The controller is room infrastructure, not an owned structure, and
			// must be preserved (just reset to unclaimed) so the room stays claimable
			// by the next player. The full add→remove sequence runs inside this
			// test so filter-isolated runs still exercise the regression path.
			const before = await run('JSON.stringify(await rooms.peek("W8N8", r => ({ hasController: !!r.controller, types: r.find(FIND_STRUCTURES).map(s => s.structureType).sort() })))');
			const beforeState = JSON.parse(before) as { hasController: boolean; types: string[] };
			assert.ok(beforeState.hasController, `precondition: W8N8 should have a controller; got: ${before}`);

			const addResult = await run('await bots.add("ControllerProbeBot", { room: "W8N8", x: 25, y: 25, modules: { main: "" } })');
			assert.ok(addResult.includes('Bot queued'), `bots.add failed: ${addResult}`);
			await tickProcessor();

			const removeResult = await run('await bots.remove("ControllerProbeBot")');
			assert.ok(removeResult.includes('Removed bot'), `bots.remove failed: ${removeResult}`);
			// Drive the unspawn intent so release() + removeObject run before the
			// post-state peek. Without this the spawn still exists in FIND_STRUCTURES.
			await tickProcessor();

			const after = await run('JSON.stringify(await rooms.peek("W8N8", r => ({ hasController: !!r.controller, types: r.find(FIND_STRUCTURES).map(s => s.structureType).sort() })))');
			const afterState = JSON.parse(after) as { hasController: boolean; types: string[] };
			assert.ok(afterState.hasController, `controller must be preserved after bots.remove; got: ${after}`);
			assert.ok(afterState.types.includes('controller'), `FIND_STRUCTURES must still include controller; got: ${after}`);
			assert.ok(!afterState.types.includes('spawn'), `spawn should have been removed; got: ${after}`);
		});

		test('bots.remove rejects unknown user', async () => {
			const result = await run('await bots.remove("Nobody")');
			assert.ok(result.includes('not found'));
		});

		test('bots.remove clears room safe-mode timer', async () => {
			// Regression: cleanUserOwnedRooms reset the controller's counters but
			// left `room['#safeModeUntil']` alone, so the next claimer (or map
			// view) still saw the old protection window. The canonical unclaim
			// path in mods/controller/processor.ts resets it — we must too.
			const roomName = 'W7N6';
			await run(`await bots.add("SafeModeBot", { room: "${roomName}", x: 25, y: 25, modules: { main: "" } })`);
			await tickProcessor();
			const before = await run(`await rooms.peek("${roomName}", r => r['#safeModeUntil'])`);
			assert.ok(Number(before) > 0, `precondition: #safeModeUntil should be positive after bots.add; got: ${before}`);

			await run('await bots.remove("SafeModeBot")');
			// unspawn intent → ControllerProc.release zeroes #safeModeUntil; fires
			// on the next processor tick (same canonical flow as /api/user/respawn).
			await tickProcessor();
			const after = await run(`await rooms.peek("${roomName}", r => r['#safeModeUntil'])`);
			assert.strictEqual(Number(after), 0, `#safeModeUntil must be 0 after bots.remove; got: ${after}`);
		});

		test('bots.remove leaves no bot-owned structures in the claimed room', async () => {
			// Belt-and-braces: cleanUserOwnedRooms walks #objects and removes
			// anything whose #user matches. The controller is the one intentional
			// exception. `bots.remove spawn is gone from room` earlier checks the
			// spawn; this verifies it generalizes — no FIND_STRUCTURES entry
			// should report `owner.username === 'StructSweepBot'`.
			const roomName = 'W7N8';
			await run(`await bots.add("StructSweepBot", { room: "${roomName}", x: 25, y: 25, modules: { main: "" } })`);
			await tickProcessor();
			await run('await bots.remove("StructSweepBot")');
			// Canonical unspawn runs on the next tick; spawn → ruin, creeps removed.
			await tickProcessor();

			const ownedCount = await run(`await rooms.peek("${roomName}", r => r.find(FIND_STRUCTURES).filter(s => s.owner && s.owner.username === 'StructSweepBot').length)`);
			assert.strictEqual(Number(ownedCount), 0, `no bot-owned structures should remain; got: ${ownedCount}`);
		});

		test('bots.remove clears processor scratch state for user rooms', async () => {
			// Regression: cleanUserOwnedRooms used to call flushUsers but discard
			// the previous snapshot, so `processor/activeRooms` kept the removed
			// user's intent count forever. Every subsequent tick then hit
			// intentAbandonTimeout (5s) waiting for intents that never arrive.
			const roomName = 'W7N7';
			const addResult = await run(`await bots.add("ScratchProbeBot", { room: "${roomName}", x: 25, y: 25, modules: { main: "" } })`);
			assert.ok(addResult.includes('Bot queued'), `bots.add failed: ${addResult}`);
			const userId = await run('users.findByName("ScratchProbeBot")');
			assert.ok(userId !== 'null', `expected user to exist after bots.add; got: ${userId}`);

			// Drive the placeSpawn intent through the processor's real pipeline —
			// that's what populates processor/activeRooms, user/{id}/intentRooms,
			// etc. via updateUserRoomRelationships in finalize. No hand-rolled
			// scratch setup: the test exercises the exact state the live server
			// would see after one tick.
			await tickProcessor();

			const beforeActive = await run(`await storage.scratch.zscore('processor/activeRooms', '${roomName}')`);
			// Score is intentPlayers.players.length (model.ts:328) — exactly 1
			// because exactly one real player (our bot) has an intent-bearing
			// structure (the spawn) in this room.
			assert.strictEqual(Number(beforeActive), 1, `precondition: activeRooms score should be 1 after tick; got: ${beforeActive}`);
			const beforeIntentRooms = await run(`await storage.scratch.smembers('user/${userId}/intentRooms')`);
			assert.ok(beforeIntentRooms.includes(roomName), `precondition: user/{id}/intentRooms should include ${roomName}; got: ${beforeIntentRooms}`);

			const removeResult = await run('await bots.remove("ScratchProbeBot")');
			assert.ok(removeResult.includes('Removed bot'), `bots.remove failed: ${removeResult}`);
			// unspawn's finalize runs updateUserRoomRelationships, which srem's
			// the room from intentRooms/presenceRooms and zadds the new 0 score
			// to processor/activeRooms. All canonical — no hand-rolled scratch
			// writes in the CLI path.
			await tickProcessor();

			// Canonical path: unspawn finalize calls updateUserRoomRelationships
			// (zadds score=0) and then, because no player has intents here
			// anymore, `sleepRoomUntil` in RoomProcessor.finalize zrems the
			// entry entirely. Either outcome — score=0 or absent — proves the
			// removed user's intent count is no longer lingering in the
			// processor queue (the regression was a stuck >0 score forever).
			const afterActive = await run(`await storage.scratch.zscore('processor/activeRooms', '${roomName}')`);
			const afterActiveNum = afterActive === 'null' ? 0 : Number(afterActive);
			assert.strictEqual(
				afterActiveNum, 0,
				`activeRooms score must be 0 or absent after removing the room's only intent player; got: ${afterActive}`,
			);

			const afterIntentRooms = await run(`await storage.scratch.smembers('user/${userId}/intentRooms')`);
			assert.ok(
				!afterIntentRooms.includes(roomName),
				`user/{id}/intentRooms must not contain ${roomName} after remove; got: ${afterIntentRooms}`,
			);
		});

		test('bots.remove converts owned structures to ruins (canonical Screeps behavior)', async () => {
			// Regression: cleanUserOwnedRooms walks #objects and deletes owned
			// structures outright via room['#removeObject']. The canonical
			// `unspawn` intent in mods/spawn/processor.ts converts owned
			// structures to ruins (createRuin(object, 500000)) — ruins are
			// Screeps-standard post-respawn state; they hold a snapshot of the
			// former structure and decay over 500k ticks. Map tooling and bots
			// reason about them. Deleting outright drifts from canonical
			// behavior and is the headline bug of the audit item.
			const roomName = 'W8N5';
			await run(`await bots.add("RuinProbeBot", { room: "${roomName}", x: 25, y: 25, modules: { main: "" } })`);
			await tickProcessor();
			// Confirm spawn placed before remove so the assertion below is
			// measuring remove-behavior, not an add-failure.
			const beforeSpawns = await run(`await rooms.peek("${roomName}", r => r.find(FIND_STRUCTURES).filter(s => s.structureType === 'spawn').length)`);
			assert.strictEqual(Number(beforeSpawns), 1, `precondition: spawn should exist before remove; got: ${beforeSpawns}`);

			await run('await bots.remove("RuinProbeBot")');
			await tickProcessor();

			// After the canonical unspawn path runs, the spawn structure is
			// gone AND a ruin takes its place at the same position.
			const afterStructures = await run(`await rooms.peek("${roomName}", r => r.find(FIND_STRUCTURES).filter(s => s.structureType === 'spawn').length)`);
			assert.strictEqual(Number(afterStructures), 0, `spawn structure must be gone; got: ${afterStructures}`);

			const ruinsJson = await run(`JSON.stringify(await rooms.peek("${roomName}", r => r.find(FIND_RUINS).map(ruin => ({ x: ruin.pos.x, y: ruin.pos.y, structureType: ruin.structure.structureType }))))`);
			const ruins = JSON.parse(ruinsJson) as { x: number; y: number; structureType: string }[];
			assert.ok(
				ruins.some(r => r.structureType === 'spawn' && r.x === 25 && r.y === 25),
				`expected a spawn ruin at (25,25); got: ${ruinsJson}`,
			);
		});

		test('bots.add placement and activation persist across multiple ticks', async () => {
			// Multi-tick endurance test — exists because a prior hand-rolled
			// bots.add looked right at tick 0 (state visible via peek) but got
			// wiped by tick 1 (processor's copyRoomFromPreviousTick picked up
			// the empty "opposite" slot of the double-buffered room store).
			// The canonical placeSpawn intent path fixes this: processor's
			// didUpdate → saveRoom commits a full blob, and every subsequent
			// tick's finalize keeps both slots coherent.
			//
			// Pins the four scratch keys the runner + processor depend on AND
			// re-verifies them after several ticks so any regression that
			// passes at tick 1 but fails later (like the earlier double-buffer
			// bug) is caught. "Code is actually running" is exercised
			// indirectly: if activeUsers + user/{id}/intentRooms remain
			// populated, the live server's runner service (not part of this
			// test harness) would execute the user's loop() every tick.
			const roomName = 'W4N8';
			const addResult = await run(`await bots.add("ActivateProbeBot", { room: "${roomName}", x: 25, y: 25, modules: { main: "module.exports.loop = function(){ Memory.ticks = (Memory.ticks || 0) + 1; }" } })`);
			assert.ok(addResult.includes('Bot queued'), `bots.add failed: ${addResult}`);
			const userId = await run('users.findByName("ActivateProbeBot")');
			assert.ok(userId !== 'null', `expected user to exist after bots.add; got: ${userId}`);

			// Drive the first tick so the placeSpawn intent runs.
			await tickProcessor();

			const firstActiveUsers = await run('await storage.scratch.smembers(\'activeUsers\')');
			assert.ok(firstActiveUsers.includes(userId), `activeUsers must contain the new user after tick 1; got: ${firstActiveUsers}`);

			const firstIntentRooms = await run(`await storage.scratch.smembers('user/${userId}/intentRooms')`);
			assert.ok(firstIntentRooms.includes(roomName), `user/{id}/intentRooms must contain ${roomName} after tick 1; got: ${firstIntentRooms}`);

			const firstActiveScore = await run(`await storage.scratch.zscore('processor/activeRooms', '${roomName}')`);
			// Score is intentPlayers.players.length — exactly 1 for the lone bot.
			assert.strictEqual(Number(firstActiveScore), 1, `processor/activeRooms score must be 1 after tick 1; got: ${firstActiveScore}`);

			const firstControlledRooms = await run(`await storage.scratch.smembers('user/${userId}/controlledRooms')`);
			assert.ok(firstControlledRooms.includes(roomName), `user/{id}/controlledRooms must contain ${roomName} after tick 1; got: ${firstControlledRooms}`);

			// Verify the spawn actually landed with the expected user + position.
			// Reads `#user` (persisted field) rather than `spawn.owner.username`
			// — `owner` derives from the runtime-only `userInfo` cache populated
			// by the runner's VM init (driver/runtime/index.ts:108). Tests don't
			// run the runner, so that cache stays empty for dynamically-created
			// users. The invariant we need ("spawn belongs to ActivateProbeBot")
			// is the same: userId above was resolved via
			// users.findByName("ActivateProbeBot") — so if spawn["#user"] ===
			// userId, spawn is owned by ActivateProbeBot transitively.
			const firstSpawn = await run(`JSON.stringify(await rooms.peek("${roomName}", r => { const s = r.find(FIND_STRUCTURES).find(s => s.structureType === "spawn"); return s ? { x: s.pos.x, y: s.pos.y, spawnUser: s["#user"], spawnActive: s["#active"], roomUser: r["#user"], roomLevel: r["#level"], roomUsers: r["#users"] } : null; }))`);
			const firstSpawnState = JSON.parse(firstSpawn);
			assert.ok(firstSpawnState !== null, `spawn should exist after tick 1; got: ${firstSpawn}`);
			assert.strictEqual(firstSpawnState.x, 25);
			assert.strictEqual(firstSpawnState.y, 25);
			// Full chain: users.findByName('ActivateProbeBot') → userId; spawn['#user'] === userId; room['#user'] === userId.
			assert.strictEqual(firstSpawnState.spawnUser, userId, `spawn['#user'] must be the new bot after tick 1; got: ${firstSpawn}`);
			assert.strictEqual(firstSpawnState.spawnActive, true, `spawn['#active'] must be true after claim+checkActiveStructures; got: ${firstSpawn}`);
			assert.strictEqual(firstSpawnState.roomUser, userId, `room['#user'] must be the new bot; got: ${firstSpawn}`);
			assert.strictEqual(firstSpawnState.roomLevel, 1);
			// flushUsers ran as part of finalize and registered the user in every bucket.
			assert.ok(firstSpawnState.roomUsers.intents.includes(userId), `room['#users'].intents must include the new bot; got: ${firstSpawn}`);
			assert.ok(firstSpawnState.roomUsers.presence.includes(userId), `room['#users'].presence must include the new bot; got: ${firstSpawn}`);

			// Run several more ticks. Any double-buffer wipe or
			// "slept-after-one-tick" regression would surface here — state
			// looks right at tick 1 but decays afterwards.
			await tickProcessor(5);

			const laterSpawn = await run(`JSON.stringify(await rooms.peek("${roomName}", r => { const s = r.find(FIND_STRUCTURES).find(s => s.structureType === "spawn"); return s ? { spawnUser: s["#user"], spawnActive: s["#active"], spawnHits: s.hits, spawnEnergy: s.store?.energy, roomUser: r["#user"], roomLevel: r["#level"], roomUsers: r["#users"] } : null; }))`);
			const laterSpawnState = JSON.parse(laterSpawn);
			assert.ok(laterSpawnState !== null, `spawn should still exist after 6 ticks; got: ${laterSpawn}`);
			assert.strictEqual(laterSpawnState.spawnUser, userId, `spawn['#user'] must persist across ticks; got: ${laterSpawn}`);
			assert.strictEqual(laterSpawnState.spawnActive, true, `spawn['#active'] must remain true; got: ${laterSpawn}`);
			assert.strictEqual(laterSpawnState.roomUser, userId, `room claim must persist; got: ${laterSpawn}`);
			assert.strictEqual(laterSpawnState.roomLevel, 1);
			assert.ok(laterSpawnState.roomUsers.intents.includes(userId), `room['#users'].intents must still include the bot; got: ${laterSpawn}`);

			// Scratch state that the runner reads each tick must still be
			// populated — otherwise the live server would silently stop
			// running the bot's code after a few ticks.
			const laterActiveUsers = await run('await storage.scratch.smembers(\'activeUsers\')');
			assert.ok(laterActiveUsers.includes(userId), `activeUsers must still contain the user after 6 ticks; got: ${laterActiveUsers}`);

			const laterIntentRooms = await run(`await storage.scratch.smembers('user/${userId}/intentRooms')`);
			assert.ok(laterIntentRooms.includes(roomName), `user/{id}/intentRooms must still contain ${roomName} after 6 ticks; got: ${laterIntentRooms}`);

			const laterActiveScore = await run(`await storage.scratch.zscore('processor/activeRooms', '${roomName}')`);
			assert.strictEqual(Number(laterActiveScore), 1, `processor/activeRooms score must still be 1 after 6 ticks (room should NOT have been slept); got: ${laterActiveScore}`);
		});

		test('bots.add rejects placement on natural wall terrain', async () => {
			// (13,14) in W5N7 sits adjacent to the controller on a TERRAIN_MASK_WALL
			// tile per the layout. Reference reruns random positions until non-wall;
			// we require the operator to pick a valid pos and fail fast. Without
			// this the spawn would be persisted unreachable and the bot stuck.
			const result = await run('await bots.add("WallBot", { room: "W5N7", x: 13, y: 14, modules: { main: "" } })');
			assert.ok(result.toLowerCase().includes('wall'), `expected wall rejection, got: ${result}`);
			// Must not leave an orphan user record behind (rollback invariant).
			assert.strictEqual(await run('users.findByName("WallBot")'), 'null');
		});
	});

	describe('Package resolution (bots.add --package)', () => {
		// Build a fake package under tmpDir/node_modules/<name>/ with a
		// package.json and whatever extra files the test needs. Returning
		// `{ paths: [ tmpDir ] }` feeds `require.resolve`'s lookup.
		async function makePackage(
			tmpDir: string,
			name: string,
			pkgJson: Record<string, unknown>,
			files: Record<string, string>,
		) {
			const pkgDir = Path.join(tmpDir, 'node_modules', ...name.split('/'));
			await fs.mkdir(pkgDir, { recursive: true });
			await fs.writeFile(Path.join(pkgDir, 'package.json'), JSON.stringify({ name, ...pkgJson }));
			for (const [ rel, content ] of Object.entries(files)) {
				const full = Path.join(pkgDir, rel);
				await fs.mkdir(Path.dirname(full), { recursive: true });
				await fs.writeFile(full, content);
			}
			return pkgDir;
		}

		async function withTmp<T>(fn: (tmpDir: string) => Promise<T>): Promise<T> {
			const tmpDir = await fs.mkdtemp(Path.join(os.tmpdir(), 'xxscreeps-pkg-test-'));
			try {
				return await fn(tmpDir);
			} finally {
				await fs.rm(tmpDir, { recursive: true, force: true });
			}
		}

		test('walks main\'s source dir so multi-file packages get their siblings', async () => {
			// Regression: the prior resolver uploaded only the declared `main`,
			// which broke any package where main does `require('./sibling')`
			// (screeps-bot-tooangel has 89 such files under src/). Walking the
			// sourceDir covers siblings; package-root tests/examples stay out
			// because they live outside src/ or dist/.
			await withTmp(async tmpDir => {
				await makePackage(tmpDir, 'fake-bot', { main: 'dist/main.js' }, {
					'dist/main.js': 'require("./helper"); module.exports.loop = function(){ /* bot */ }',
					'dist/helper.js': 'module.exports = "sibling"',
					'test/spec.js': 'describe("unrelated", () => {})',
					'examples/demo.js': 'console.log("demo")',
				});
				const modules = await resolveFromPackage('fake-bot', { paths: [ tmpDir ] });
				assert.strictEqual(modules.size, 2, `expected 2 modules from dist/, got ${modules.size}: ${[ ...modules.keys() ].join(',')}`);
				assert.ok(modules.has('main'), 'entry must be renamed to "main"');
				assert.ok(modules.has('helper'), 'sibling under dist/ must be included');
				assert.ok(!modules.has('spec'), 'test/ must not be scraped');
				assert.ok(!modules.has('demo'), 'examples/ must not be scraped');
				const mainContent = modules.get('main');
				assert.ok(typeof mainContent === 'string' && mainContent.includes('/* bot */'), `main must be the declared entry, got: ${String(mainContent).slice(0, 80)}`);
			});
		});

		test('flat packages (main at pkg root) upload only the entry', async () => {
			// No nested source dir → scraping the root would pull in Gruntfile,
			// root-level test files, docs. Fall back to main-only.
			await withTmp(async tmpDir => {
				await makePackage(tmpDir, 'flat-bot', { main: 'index.js' }, {
					'index.js': 'module.exports.loop = function(){}',
					'Gruntfile.js': 'module.exports = function() {}',
					'tests.js': 'describe("meta", () => {})',
				});
				const modules = await resolveFromPackage('flat-bot', { paths: [ tmpDir ] });
				assert.strictEqual(modules.size, 1, `flat layout must upload only main; got: ${[ ...modules.keys() ].join(',')}`);
				assert.ok(modules.has('main'));
			});
		});

		test('falls back to index.js when main is omitted', async () => {
			await withTmp(async tmpDir => {
				await makePackage(tmpDir, 'indexed-bot', {}, {
					'index.js': 'module.exports.loop = function(){}',
				});
				const modules = await resolveFromPackage('indexed-bot', { paths: [ tmpDir ] });
				assert.strictEqual(modules.size, 1);
				assert.ok(modules.has('main'));
			});
		});

		test('rejects main that escapes the package root', async () => {
			// Path-traversal defense: a malicious or buggy `main` like "../../evil.js"
			// must not upload files from outside the package dir.
			await withTmp(async tmpDir => {
				await makePackage(tmpDir, 'escaping-bot', { main: '../../evil.js' }, {});
				await fs.writeFile(Path.join(tmpDir, 'evil.js'), 'module.exports = "pwned"');
				await assert.rejects(
					() => resolveFromPackage('escaping-bot', { paths: [ tmpDir ] }),
					/outside package root/,
				);
			});
		});

		test('rejects package.json whose name does not match', async () => {
			// If the upward-walk heuristic ever came back, it would silently
			// return the wrong package.json. Enforce name equality.
			await withTmp(async tmpDir => {
				const pkgDir = Path.join(tmpDir, 'node_modules', 'stated-name');
				await fs.mkdir(pkgDir, { recursive: true });
				await fs.writeFile(Path.join(pkgDir, 'package.json'), JSON.stringify({ name: 'different-name', main: 'index.js' }));
				await fs.writeFile(Path.join(pkgDir, 'index.js'), 'module.exports = {}');
				await assert.rejects(
					() => resolveFromPackage('stated-name', { paths: [ tmpDir ] }),
					/has name 'different-name', expected 'stated-name'/,
				);
			});
		});

		test('rejects main with non-.js/.wasm extension', async () => {
			await withTmp(async tmpDir => {
				await makePackage(tmpDir, 'readme-bot', { main: 'README.md' }, {
					'README.md': '# not code',
				});
				await assert.rejects(
					() => resolveFromPackage('readme-bot', { paths: [ tmpDir ] }),
					/must be \.js or \.wasm/,
				);
			});
		});

		test('errors clearly when package is not installed', async () => {
			await withTmp(async tmpDir => {
				await assert.rejects(
					() => resolveFromPackage('definitely-not-installed-bot-xyz', { paths: [ tmpDir ] }),
					/Cannot resolve package/,
				);
			});
		});

		test('supports scoped package names', async () => {
			await withTmp(async tmpDir => {
				await makePackage(tmpDir, '@fake/simplebot', { main: 'main.js' }, {
					'main.js': 'module.exports.loop = function(){}',
				});
				const modules = await resolveFromPackage('@fake/simplebot', { paths: [ tmpDir ] });
				assert.strictEqual(modules.size, 1);
				assert.ok(modules.has('main'));
			});
		});

		test('rejects main exceeding the module size cap', async () => {
			// Safety cap: the code branch caches the whole file in memory and
			// pushes it into the DB. A 16 MiB oversize main must error out
			// before we attempt to upload it.
			await withTmp(async tmpDir => {
				await makePackage(tmpDir, 'huge-bot', { main: 'main.js' }, {
					'main.js': 'x'.repeat((16 << 20) + 1),
				});
				await assert.rejects(
					() => resolveFromPackage('huge-bot', { paths: [ tmpDir ] }),
					/exceeds 16777216 bytes/,
				);
			});
		});

		test('accepts .wasm main', async () => {
			// Confirms the wasm branch of the extension allowlist actually works:
			// file is read as a Buffer (not utf8-decoded) and ends up as the
			// `main` module.
			await withTmp(async tmpDir => {
				const wasmBytes = Buffer.from([ 0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00 ]);
				const pkgDir = Path.join(tmpDir, 'node_modules', 'wasm-bot');
				await fs.mkdir(pkgDir, { recursive: true });
				await fs.writeFile(Path.join(pkgDir, 'package.json'), JSON.stringify({ name: 'wasm-bot', main: 'bot.wasm' }));
				await fs.writeFile(Path.join(pkgDir, 'bot.wasm'), wasmBytes);
				const modules = await resolveFromPackage('wasm-bot', { paths: [ tmpDir ] });
				assert.strictEqual(modules.size, 1);
				const content = modules.get('main');
				assert.ok(content instanceof Uint8Array, `.wasm content must be Uint8Array, got ${typeof content}`);
				assert.strictEqual((content as Uint8Array).byteLength, wasmBytes.byteLength);
			});
		});

		test('rejects malformed package.json', async () => {
			await withTmp(async tmpDir => {
				const pkgDir = Path.join(tmpDir, 'node_modules', 'broken-bot');
				await fs.mkdir(pkgDir, { recursive: true });
				await fs.writeFile(Path.join(pkgDir, 'package.json'), '{ not valid json');
				await fs.writeFile(Path.join(pkgDir, 'index.js'), 'module.exports = {}');
				await assert.rejects(
					() => resolveFromPackage('broken-bot', { paths: [ tmpDir ] }),
					// require.resolve reads package.json first and will fail on parse;
					// our wrapper surfaces that as a resolve failure.
					/broken-bot/,
				);
			});
		});

		test('packageRoot threads a custom node_modules root into resolveFromPackage', async () => {
			// End-to-end: operator runs `npm install --prefix data/bots <pkg>`,
			// then passes --package-root data/bots so resolveModules can find
			// the package without the workspace manifest ever referencing it.
			await withTmp(async tmpDir => {
				await makePackage(tmpDir, 'root-bot', { main: 'index.js' }, {
					'index.js': 'module.exports.loop = function(){ /* root */ }',
				});
				const modules = await resolveModules({ package: 'root-bot', packageRoot: tmpDir });
				assert.strictEqual(modules.size, 1);
				const content = modules.get('main');
				assert.ok(typeof content === 'string' && content.includes('/* root */'));
			});
		});

		test('packageRoot resolves relative paths against process.cwd()', async () => {
			// Operators typing `--package-root data/bots` expect the path to
			// mean "data/bots relative to where I'm running the command",
			// regardless of where the CLI source lives in the workspace.
			await withTmp(async tmpDir => {
				await makePackage(tmpDir, 'rel-bot', { main: 'index.js' }, {
					'index.js': 'module.exports.loop = function(){}',
				});
				const rel = Path.relative(process.cwd(), tmpDir);
				const modules = await resolveModules({ package: 'rel-bot', packageRoot: rel });
				assert.strictEqual(modules.size, 1);
			});
		});

		test('packageRoot without package is rejected', async () => {
			// packageRoot only makes sense paired with package. Rejecting the
			// combination surfaces the intent mismatch to the operator rather
			// than silently ignoring packageRoot when --code-dir or --modules
			// was meant.
			await assert.rejects(
				() => resolveModules({ packageRoot: '/tmp' }),
				/packageRoot requires package/,
			);
		});
	});

	describe('Map management', async () => {
		// Re-seed: these tests close/remove rooms on the shared shard; without a reset
		// the mutations leak out of the describe and break filtered or added-later tests.
		await seedTestShard(db, shard);

		test('map.closeRoom removes room from list', async () => {
			const result = await run('await map.closeRoom("W5N5")');
			assert.ok(result.includes('Closed'));
			const rooms = await run('JSON.stringify(await rooms.list())');
			assert.ok(!rooms.includes('"W5N5"'));
		});

		test('map.openRoom adds room back to list', async () => {
			const result = await run('await map.openRoom("W5N5")');
			assert.ok(result.includes('Opened'));
			const rooms = await run('JSON.stringify(await rooms.list())');
			assert.ok(rooms.includes('"W5N5"'));
		});

		test('map.openRoom rejects a room with no terrain entry', async () => {
			// Regression: openRoom unconditionally sadd'd the name to `rooms`
			// even if the world terrain map had no entry for it. A subsequent
			// loadRoom / rooms.peek hit "roomN/... does not exist" because
			// there was never a saved blob either. Operator adds a room via
			// a typo, sees no error, only discovers it's broken when a bot
			// tries to claim it. Validate up front.
			const result = await run('await map.openRoom("X99X99")');
			assert.ok(
				/terrain/i.test(result),
				`expected a terrain-missing rejection, got: ${result}`,
			);
			// Must not have been added to the active set on rejection.
			const rooms = await run('JSON.stringify(await rooms.list())');
			assert.ok(!rooms.includes('"X99X99"'), `X99X99 should not be in rooms after rejection; got: ${rooms}`);
		});

		test('map.closeRoom rejects unknown room', async () => {
			const result = await run('await map.closeRoom("X99X99")');
			assert.ok(result.includes('Room not found'), `expected 'Room not found', got: ${result}`);
		});

		test('map.removeRoom deletes room entirely', async () => {
			// Close first, then remove
			const result = await run('await map.removeRoom("W1N1")');
			assert.ok(result.includes('Removed'));
			const rooms = await run('JSON.stringify(await rooms.list())');
			assert.ok(!rooms.includes('"W1N1"'));
			// Loading a removed room should error
			const load = await run('await rooms.peek("W1N1", r => r.name)');
			assert.ok(load.includes('Error'));
		});

		test('map.removeRoom rejects unknown room', async () => {
			const result = await run('await map.removeRoom("X99X99")');
			assert.ok(result.includes('Room not found'), `expected 'Room not found', got: ${result}`);
		});

		test('map.closeRoom queues unspawn for users with presence so scratch state drains canonically', async () => {
			// Regression: the original closeRoom only did `srem('rooms')` +
			// clearAllWorldCaches, leaving any affected user's scratch state
			// (intentRooms / presenceRooms / controlledRooms pointing at the
			// now-closed room) orphan. A runner using those sets would keep
			// trying to act on a room the processor no longer runs. Driving
			// the canonical unspawn intent on close fixes this — the same
			// pipeline bots.remove now uses.
			const roomName = 'W9N3';
			await run(`await bots.add("CloseProbeBot", { room: "${roomName}", x: 25, y: 25, modules: { main: "" } })`);
			await tickProcessor();
			const userId = await run('users.findByName("CloseProbeBot")');
			assert.ok(userId !== 'null', `precondition: bot must exist; got: ${userId}`);
			const beforePresence = await run(`await storage.scratch.smembers('user/${userId}/presenceRooms')`);
			assert.ok(beforePresence.includes(roomName), `precondition: ${roomName} must be in presenceRooms; got: ${beforePresence}`);

			const closeResult = await run(`await map.closeRoom("${roomName}")`);
			assert.ok(closeResult.includes('Closed'), `closeRoom failed: ${closeResult}`);
			// Unspawn intent queued by closeRoom fires on the next tick and
			// the finalize path srem's the room from user scratch sets.
			await tickProcessor();

			const afterPresence = await run(`await storage.scratch.smembers('user/${userId}/presenceRooms')`);
			assert.ok(!afterPresence.includes(roomName), `user/{id}/presenceRooms must not contain closed ${roomName}; got: ${afterPresence}`);
			const afterIntentRooms = await run(`await storage.scratch.smembers('user/${userId}/intentRooms')`);
			assert.ok(!afterIntentRooms.includes(roomName), `user/{id}/intentRooms must not contain closed ${roomName}; got: ${afterIntentRooms}`);
			const afterControlled = await run(`await storage.scratch.smembers('user/${userId}/controlledRooms')`);
			assert.ok(!afterControlled.includes(roomName), `user/{id}/controlledRooms must not contain closed ${roomName}; got: ${afterControlled}`);
		});

		test('map.removeRoom refuses a room with live user presence', async () => {
			// Regression: inter-room intents from bots in adjacent rooms keep
			// dispatching to a deleted room, hanging the finalize loadRoom.
			// Block destructive removal until operator clears presence.
			const roomName = 'W9N1';
			await run(`await bots.add("RemoveProbeBot", { room: "${roomName}", x: 25, y: 25, modules: { main: "" } })`);
			await tickProcessor();
			const userId = await run('users.findByName("RemoveProbeBot")');
			assert.ok(userId !== 'null', `precondition: bot must exist; got: ${userId}`);
			const beforePresence = await run(`await storage.scratch.smembers('user/${userId}/presenceRooms')`);
			assert.ok(beforePresence.includes(roomName), `precondition: ${roomName} in presenceRooms; got: ${beforePresence}`);

			const result = await run(`await map.removeRoom("${roomName}")`);
			assert.ok(/presence/i.test(result), `expected presence rejection; got: ${result}`);
			const rooms = await run('JSON.stringify(await rooms.list())');
			assert.ok(rooms.includes(`"${roomName}"`), `room must remain on rejection; got: ${rooms}`);
		});
	});

	describe('Room-status reporting', async () => {
		// Regression coverage for the stale-backend-cache bug: closing a room
		// via the CLI used to leave /api/game/room-status (and anything built
		// on `World.map.getRoomStatus`) reporting 'normal' until restart.
		// The fix teaches `shard.loadWorld()` to pull the active-rooms set
		// and publishes an `accessibleRooms` invalidation so out-of-process
		// consumers can refresh.
		await seedTestShard(db, shard);

		test('shard.loadWorld() populates world.accessibleRooms from the active-rooms set', async () => {
			const world = await shard.loadWorld();
			const active = await shard.data.smembers('rooms');
			assert.ok(world.accessibleRooms, 'loadWorld() must populate accessibleRooms');
			assert.strictEqual(world.accessibleRooms.size, active.length);
			for (const roomName of active) {
				assert.ok(world.accessibleRooms.has(roomName), `${roomName} missing from accessibleRooms`);
			}
		});

		test('getRoomStatus() returns out-of-borders for a closed room and normal for an active one', async () => {
			const before = await shard.loadWorld();
			assert.deepStrictEqual(before.map.getRoomStatus('W7N7'), { status: 'normal', timestamp: null });
			await run('await map.closeRoom("W7N7")');
			const after = await shard.loadWorld();
			assert.deepStrictEqual(after.map.getRoomStatus('W7N7'), { status: 'out of borders', timestamp: null });
			assert.deepStrictEqual(after.map.getRoomStatus('W6N6'), { status: 'normal', timestamp: null });
		});

		test('getRoomStatus() returns undefined for a room with no terrain entry', async () => {
			const world = await shard.loadWorld();
			assert.strictEqual(world.map.getRoomStatus('X99X99'), undefined);
		});

		test('closeRoom publishes an accessibleRooms invalidation', async () => {
			const subscription = await getInvalidationChannel(shard).subscribe();
			const received: InvalidationMessage[] = [];
			subscription.listen(message => received.push(message));
			try {
				await run('await map.closeRoom("W4N4")');
				// Give the pubsub loopback a turn to deliver.
				await new Promise<void>(resolve => {
					setImmediate(resolve);
				});
				assert.ok(
					received.some(message => message.type === 'accessibleRooms'),
					`expected accessibleRooms message; received: ${JSON.stringify(received)}`,
				);
			} finally {
				subscription.disconnect();
			}
		});

		test('openRoom publishes an accessibleRooms invalidation', async () => {
			const subscription = await getInvalidationChannel(shard).subscribe();
			const received: InvalidationMessage[] = [];
			subscription.listen(message => received.push(message));
			try {
				await run('await map.openRoom("W4N4")');
				await new Promise<void>(resolve => {
					setImmediate(resolve);
				});
				assert.ok(
					received.some(message => message.type === 'accessibleRooms'),
					`expected accessibleRooms message; received: ${JSON.stringify(received)}`,
				);
			} finally {
				subscription.disconnect();
			}
		});
	});

	describe('Cache invalidation', async () => {
		// Re-seed for isolation: the Map management describe above closed/removed
		// rooms on the shared shard, and the test below relies on a clean room
		// to add a bot into.
		await seedTestShard(db, shard);

		test('rooms.poke survives a subsequent processor tick (invalidates the worker room cache)', async () => {
			// Engine: engine/processor/worker.ts:80-99 keeps an in-memory
			// roomCache across ticks for actively-processed rooms. The cached
			// Room is mutated in place by intent processors and written back
			// to disk via saveRoom whenever a tick has receivedUpdate=true.
			// CLI: rooms.poke writes to disk directly via saveRoom +
			// copyRoomFromPreviousTick, bypassing the processor — so the
			// worker's cached Room never sees the change. The next tick that
			// triggers didUpdate (any spawn/upgrade/movement intent) will
			// saveRoom from the stale cached Room and silently revert the
			// poke. Reproduced here end-to-end: bots.add → tick (cache
			// populated with level=1) → poke level=5 → spawn-creep intent
			// (drives didUpdate=true on next tick) → tick → assert disk holds
			// the poked level=5, not the cached level=1.
			//
			// The fix: rooms.poke publishes an 'invalidate' message on the
			// invalidation channel; processor workers (and this test harness
			// via test-setup.ts's subscription) drop the stale cached Room.
			const roomName = 'W2N2';
			await run(`await bots.add("PokeCacheBot", { room: "${roomName}", x: 25, y: 25, modules: { main: "" } })`);
			await tickProcessor();
			const userId = await run('users.findByName("PokeCacheBot")');
			assert.ok(userId !== 'null', `precondition: bot must exist; got: ${userId}`);
			const spawnId = await run(`await rooms.peek("${roomName}", r => r.find(FIND_STRUCTURES).find(s => s.structureType === 'spawn').id)`);
			assert.ok(spawnId && spawnId !== 'undefined', `precondition: spawn must exist; got: ${spawnId}`);

			// Sanity: placeSpawn intent set #level to 1, and the cached Room
			// in the harness now carries level=1 (the worker's saved state).
			const before = Number(await run(`await rooms.peek("${roomName}", r => r['#level'])`));
			assert.strictEqual(before, 1, `precondition: level must be 1 after placeSpawn; got: ${before}`);

			// Poke level=5 — saveRoom + copyForward write level=5 to both
			// double-buffer slots on disk. The cached Room in the harness
			// (and a real worker) still holds level=1 unless invalidation
			// fires.
			await run(`await rooms.poke("${roomName}", "0", r => { r['#level'] = 5; })`);

			// Push a spawn intent so the next tick has an actual mutation
			// (spawn.spawning = ..., didUpdate). This is the canonical path
			// the runner would take in production — same wire format
			// (pushIntentsForRoomNextTick) the live server uses. Without
			// this, an idle bot's tick has receivedUpdate=false, the
			// processor only copyForwards, and the disk-side poke is
			// preserved by accident, masking the cache bug.
			await pushIntentForTest(roomName, userId, {
				local: {},
				object: { [spawnId]: { spawn: [ [ 'move' ], 'PokeProbeCreep1', null, null ] } },
			});
			await tickProcessor();

			// With the fix, the worker reloaded from disk (level=5) before
			// processing, the spawn intent ran on the fresh Room, and
			// saveRoom committed level=5. Without the fix, the worker
			// processed using the stale cached Room (level=1), saveRoom
			// wrote level=1, reverting the poke.
			const after = Number(await run(`await rooms.peek("${roomName}", r => r['#level'])`));
			assert.strictEqual(
				after, 5,
				`poke must persist when the next tick saveRoom's a cached Room (without invalidation, the worker's cached Room overwrites the poke); got: ${after}`,
			);
		});
	});

	describe('System reset', () => {
		// Run last — destroys all data.

		test('system.importWorld refuses when simulation is not paused', async () => {
			// Regression: the handler uses withGameLock (game mutex), which
			// stops main.ts from publishing new work but does NOT stop
			// runner/processor workers already mid-flight. Flushing scratch
			// under a live worker drops intents or crashes it on a missing
			// key, so the handler demands an explicit pauseSimulation hold —
			// admin CLI auto-wraps, REPL users call it manually.
			const sandbox = createSandbox(db, shard, pause);
			try {
				const refused = await executeCommand(sandbox, 'await system.importWorld()');
				assert.ok(
					/pause/i.test(refused),
					`expected a pauseSimulation requirement error; got: ${refused}`,
				);
			} finally {
				await destroySandbox(sandbox);
			}
		});

		test('system.importWorld wipes and re-seeds the default world when paused', async () => {
			await run('system.pauseSimulation()');
			try {
				const result = await run('await system.importWorld()');
				assert.ok(result.includes('wiped'));
				assert.ok(result.includes('Imported'));
			} finally {
				await run('system.resumeSimulation()');
			}
		});

		test('after default import rooms exist', async () => {
			const result = await run('JSON.stringify(await rooms.list())');
			const rooms = JSON.parse(result) as string[];
			assert.ok(rooms.length > 0, 'should have rooms after re-seed');
		});

		test('system.importWorld with empty=true leaves the world empty', async () => {
			await run('system.pauseSimulation()');
			try {
				const result = await run('await system.importWorld({ empty: true })');
				assert.ok(result.includes('wiped'));
			} finally {
				await run('system.resumeSimulation()');
			}
		});

		test('after empty import rooms set is empty', async () => {
			const result = await run('JSON.stringify(await rooms.list())');
			assert.strictEqual(result, '[]');
		});

		test('system.importWorld rejects source + empty together', async () => {
			await run('system.pauseSimulation()');
			try {
				const result = await run('await system.importWorld({ source: "/tmp/x.json", empty: true })');
				assert.ok(/mutually exclusive/i.test(result), `expected mutually-exclusive error; got: ${result}`);
			} finally {
				await run('system.resumeSimulation()');
			}
		});

		test('system.importWorld re-seeds an empty database', async () => {
			await run('system.pauseSimulation()');
			try {
				const result = await run('await system.importWorld()');
				assert.ok(result.includes('Imported'));
			} finally {
				await run('system.resumeSimulation()');
			}
			const rooms = await run('JSON.stringify(await rooms.list())');
			const roomList = JSON.parse(rooms) as string[];
			assert.ok(roomList.length > 0, 'should have rooms after import');
		});

		test('system.importWorld populates both double-buffer slots for every imported room', async () => {
			// Regression: importWorld saved each room at `gameTime` only,
			// populating slot `gameTime % 2`. The opposite slot stayed
			// empty. Any consumer reading at `shard.time + 1` (e.g., a
			// follow-up tick that didn't re-process the room, or any
			// external tool that advances time) could hit
			// "roomN/<room> does not exist". The fix copies each imported
			// room forward one tick so both slots are coherent from the
			// moment import finishes — matches the steady state the live
			// server reaches via processor tick copy-forwards.
			//
			// Check the raw blob keys directly because loadRoom's checkTime
			// guard only accepts current or previous tick; we want to
			// verify the *next* tick's slot is also populated.
			//
			// Self-seeding so the test passes in isolation — can't rely on
			// an earlier System reset test having run importWorld on this
			// shard.
			await run('system.pauseSimulation()');
			try {
				await run('await system.importWorld({ empty: true })');
				await run('await system.importWorld()');
			} finally {
				await run('system.resumeSimulation()');
			}
			const roomsList = await shard.data.smembers('rooms');
			assert.ok(roomsList.length > 0, 'precondition: rooms imported');
			for (const roomName of roomsList.slice(0, 5)) {
				const slot0 = await shard.data.get(`room0/${roomName}`, { blob: true });
				const slot1 = await shard.data.get(`room1/${roomName}`, { blob: true });
				assert.ok(slot0 !== null, `room0/${roomName} must be populated after importWorld; got: null`);
				assert.ok(slot1 !== null, `room1/${roomName} must be populated after importWorld; got: null`);
			}
		});

		test('imported rooms have game objects', async () => {
			// Pick a room that should have sources and a controller in the default world
			const count = await run('await rooms.peek("W5N5", r => r["#objects"].length)');
			assert.ok(Number(count) > 0, 'room should have objects');
			const hasSource = await run('(await rooms.peek("W5N5", r => r.find(FIND_SOURCES).length > 0)) + ""');
			assert.strictEqual(hasSource, 'true', 'should have sources');
		});

		test('importWorld is idempotent on a populated database', async () => {
			// Without the pre-flush introduced for P1-4, re-importing would produce
			// duplicate rooms and users.
			const roomsBefore = JSON.parse(await run('JSON.stringify((await rooms.list()).length)')) as number;
			const usersBefore = JSON.parse(await run('JSON.stringify((await users.list()).length)')) as number;
			await run('system.pauseSimulation()');
			try {
				await run('await system.importWorld()');
			} finally {
				await run('system.resumeSimulation()');
			}
			const roomsAfter = JSON.parse(await run('JSON.stringify((await rooms.list()).length)')) as number;
			const usersAfter = JSON.parse(await run('JSON.stringify((await users.list()).length)')) as number;
			assert.strictEqual(roomsAfter, roomsBefore, 're-import must not duplicate rooms');
			assert.strictEqual(usersAfter, usersBefore, 're-import must not duplicate users');
		});

		test('importWorld rejects non-string source', async () => {
			await run('system.pauseSimulation()');
			try {
				const result = await run('await system.importWorld({ source: 123 })');
				assert.ok(result.includes('source must be a string'), `expected type error, got: ${result}`);
			} finally {
				await run('system.resumeSimulation()');
			}
		});

		test('importWorld rejects non-json source', async () => {
			await run('system.pauseSimulation()');
			try {
				const result = await run('await system.importWorld({ source: "/etc/hosts" })');
				assert.ok(result.includes('must be a .json file'), `expected extension error, got: ${result}`);
			} finally {
				await run('system.resumeSimulation()');
			}
		});

		test('importWorld rejects missing source file', async () => {
			await run('system.pauseSimulation()');
			try {
				const result = await run(`await system.importWorld({ source: "/tmp/xxscreeps-nonexistent-${process.pid}.json" })`);
				assert.ok(result.includes('not found or unreadable'), `expected stat error, got: ${result}`);
			} finally {
				await run('system.resumeSimulation()');
			}
		});
	});
});

// Socket integration + smoke tests live in a sibling file. Dynamic-import at
// the bottom so the Socket describe queues after CLI.
await import('./test-socket.js');
