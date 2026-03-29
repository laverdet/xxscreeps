import { assert, describe, test } from 'xxscreeps/test/index.js';
import { importMods } from 'xxscreeps/config/mods/index.js';
import { initializeGameEnvironment } from 'xxscreeps/game/index.js';
import { instantiateTestShard } from 'xxscreeps/test/import.js';
import { executeCommand } from './sandbox.js';
import 'xxscreeps/backend/sockets/render.js';

await importMods('backend');
initializeGameEnvironment();

const { db, shard } = await instantiateTestShard();
const run = (expression: string) => executeCommand(db, shard, expression);

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
			assert.ok(result.includes('a'));
			assert.ok(result.includes('1'));
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
			assert.ok(result.includes('42'));
			assert.ok(result.includes('a'));
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
	});

	describe('Sandbox isolation', () => {
		test('sandbox is fresh per call', async () => {
			await run('var foo = 123');
			assert.strictEqual(await run('typeof foo'), 'undefined');
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
		});

		test('storage.db aliases db', async () => {
			assert.strictEqual(await run('storage.db === db'), 'true');
		});

		test('storage.shard aliases shard', async () => {
			assert.strictEqual(await run('storage.shard === shard'), 'true');
		});

		test('storage.pubsub is available', async () => {
			const result = await run('typeof storage.pubsub.publish');
			assert.strictEqual(result, 'function');
		});
	});

	describe('Room helpers', () => {
		test('rooms.list() returns room names', async () => {
			const result = await run('rooms.list()');
			assert.ok(result.includes('W'));
		});

		test('rooms.load() returns a plain object keyed by _id', async () => {
			const result = await run('JSON.stringify(await rooms.load("W5N5"))');
			const snapshot = JSON.parse(result);
			const ids = Object.keys(snapshot);
			assert.ok(ids.length === 4);
			for (const id of ids) {
				assert.strictEqual(snapshot[id]._id, id);
			}
		});

		test('rooms.load() objects have rendered fields', async () => {
			const result = await run('JSON.stringify(await rooms.load("W5N5"))');
			const snapshot = JSON.parse(result);
			for (const object of Object.values(snapshot) as any[]) {
				assert.ok(typeof object._id === 'string');
				assert.ok(typeof object.type === 'string');
				assert.ok(typeof object.x === 'number');
				assert.ok(typeof object.y === 'number');
			}
		});

		test('rooms.load() includes all object types in room', async () => {
			const result = await run('JSON.stringify(await rooms.load("W9N9"))');
			const types = new Set(Object.values(JSON.parse(result)).map((o: any) => o.type));
			assert.ok(types.has('controller'));
			assert.ok(types.has('source'));
			assert.ok(types.has('mineral'));
		});

		test('rooms.load() controller has rendered properties', async () => {
			const result = await run('JSON.stringify(await rooms.load("W9N9"))');
			const controller = Object.values(JSON.parse(result)).find((o: any) => o.type === 'controller') as any;
			assert.ok('level' in controller);
			assert.ok('downgradeTime' in controller);
			assert.ok('safeModeAvailable' in controller);
		});

		test('rooms.load() with non-existent room throws', async () => {
			const result = await run('await rooms.load("X9X9")');
			assert.ok(result.includes('Error') || result.includes('null') || result.includes('undefined'));
		});
	});

	describe('System', () => {
		test('system.getTickDuration returns a number', async () => {
			const result = await run('system.getTickDuration()');
			assert.ok(!Number.isNaN(Number(result)));
		});

		test('system.setTickDuration rejects invalid input', async () => {
			assert.strictEqual(await run('system.setTickDuration(-1)'), 'Invalid tick duration');
			assert.strictEqual(await run('system.setTickDuration("fast")'), 'Invalid tick duration');
		});

		test('system.pauseSimulation acquires lock and returns confirmation', async () => {
			assert.strictEqual(await run('system.pauseSimulation()'), 'Simulation paused');
		});

		test('system.pauseSimulation when already paused returns error', async () => {
			assert.strictEqual(await run('system.pauseSimulation()'), 'Simulation is already paused');
		});

		test('system.resumeSimulation releases lock and returns confirmation', async () => {
			assert.strictEqual(await run('system.resumeSimulation()'), 'Simulation resumed');
		});

		test('system.resumeSimulation when not paused returns error', async () => {
			assert.strictEqual(await run('system.resumeSimulation()'), 'Simulation is not paused');
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
			const names = JSON.parse(result);
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
