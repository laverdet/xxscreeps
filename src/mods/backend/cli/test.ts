import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { importMods } from 'xxscreeps/config/mods/index.js';
import { initializeGameEnvironment } from 'xxscreeps/game/index.js';
import { instantiateTestShard } from 'xxscreeps/test/import.js';
import { assert, describe, test } from 'xxscreeps/test/index.js';
import { executeCommand } from './sandbox.js';
import { startSocketServer } from './socket.js';
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
			assert.ok(result !== 'undefined');
		});

		test('db provider is functional', async () => {
			const result = await run('await db.smembers("users")');
			assert.ok(result.includes('100'));
		});

		test('storage.db aliases db', async () => {
			assert.strictEqual(await run('storage.db === db'), 'true');
			// Verify it's not undefined === undefined
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
			const rooms = JSON.parse(result);
			assert.ok(Array.isArray(rooms));
			assert.ok(rooms.length > 0);
			assert.ok(rooms.every((r: string) => /^[WE]\d+[NS]\d+$/.test(r)));
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

// Socket integration tests
const testSocketPath = path.join(os.tmpdir(), `xxscreeps-test-${process.pid}.sock`);

function sendCommand(socketPath: string, expression: string): Promise<{ result?: string; error?: string }> {
	return new Promise((resolve, reject) => {
		const client = net.connect({ path: socketPath }, () => {
			client.write(JSON.stringify({ expression }) + '\n');
		});
		let buffer = '';
		client.on('data', chunk => {
			buffer += chunk.toString();
			const newline = buffer.indexOf('\n');
			if (newline !== -1) {
				const line = buffer.slice(0, newline);
				client.destroy();
				resolve(JSON.parse(line));
			}
		});
		client.on('error', reject);
	});
}

// Start socket server at module level so it's ready before describe blocks run
// (the framework runs tests before nested describes within the same level)
const socketCleanup = await startSocketServer(db, shard, testSocketPath, () => {});

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
						resolve(JSON.parse(buffer.slice(0, newline)));
					}
				});
				client.on('error', reject);
			});
			assert.ok(response.error);
		});

		test('helpers available through socket', async () => {
			const response = await sendCommand(testSocketPath, 'JSON.stringify(await rooms.list())');
			const rooms = JSON.parse(response.result!);
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
						responses.push(JSON.parse(line).result);
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
			const [ a, b ] = await Promise.all([
				sendCommand(testSocketPath, '"from-a"'),
				sendCommand(testSocketPath, '"from-b"'),
			]);
			assert.strictEqual(a.result, 'from-a');
			assert.strictEqual(b.result, 'from-b');
		});

		test('shared state is visible across clients', async () => {
			// Client A queries, client B queries the same thing — both see the same data
			const [ a, b ] = await Promise.all([
				sendCommand(testSocketPath, 'JSON.stringify(await rooms.list())'),
				sendCommand(testSocketPath, 'JSON.stringify(await rooms.list())'),
			]);
			assert.strictEqual(a.result, b.result);
		});

		test('state mutation on one client is visible to another', async () => {
			// Client A pauses
			const pause = await sendCommand(testSocketPath, 'system.pauseSimulation()');
			assert.strictEqual(pause.result, 'Simulation paused');

			// Client B sees it's already paused
			const duplicate = await sendCommand(testSocketPath, 'system.pauseSimulation()');
			assert.strictEqual(duplicate.result, 'Simulation is already paused');

			// Client B resumes
			const resume = await sendCommand(testSocketPath, 'system.resumeSimulation()');
			assert.strictEqual(resume.result, 'Simulation resumed');
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
