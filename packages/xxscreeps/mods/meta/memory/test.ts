import * as assert from 'node:assert/strict';
import { RoomPosition } from 'xxscreeps/game/position.js';
import * as Spawn from 'xxscreeps/mods/classic/spawn/spawn.js';
import { publicSegmentChannel, saveMemorySegmentBlob } from 'xxscreeps/mods/meta/memory/model.js';
import { describe, simulate, test } from 'xxscreeps/test/index.js';
import { utf16ToBuffer } from 'xxscreeps/utility/string.js';
// nb: Try not to include too much in this file because `sandbox` uses a fake function that gets
// stringified. So includes here confuse the seen globals.

describe('mod/meta/memory', () => {
	const sim = simulate({
		W1N1: room => {
			room['#level'] = 1;
			room['#user'] = room.controller!['#user'] = '100';
			room['#insertObject'](Spawn.create(new RoomPosition(25, 25, 'W1N1'), '100', 'Spawn1'));
		},
	});

	test('smoke test', () => sim(async ({ sandbox, tick }) => {
		await using player = await sandbox('200', global => {
			switch (global.Game.time) {
				case 1: global.Memory.test = 'foo'; break;
				case 2: assert.equal(global.Memory.test, 'foo'); break;
				case 3: global.Game.cpu.halt(); break;
				case 5: assert.equal(global.Memory.test, 'foo'); break;
			}
		});
		await tick(5);
	}));

	test('crunch', () => sim(async ({ sandbox, tick }) => {
		await using player = await sandbox('200', global => {
			switch (global.Game.time) {
				case 1: {
					const test = [ 1, undefined ];
					// @ts-expect-error
					global.test = test;
					global.Memory.test = test;
					break;
				}
				case 2:
					// @ts-expect-error
					assert.equal(global.test, global.Memory.test);
					assert.deepStrictEqual(global.Memory.test, [ 1, null ]);
			}
		});
		await tick(2);
	}));

	test('invalid payload', () => sim(async ({ sandbox, tick }) => {
		await using player = await sandbox('200', global => {
			global.RawMemory.set('}');
			assert.equal(global.RawMemory._parsed, undefined);
			assert.equal(global.Memory, null);
			assert.equal(global.RawMemory._parsed, null);
		});
		await tick(1);
	}));

	test('RawMemory._parsed becomes undefined', () => sim(async ({ sandbox, tick }) => {
		await using player = await sandbox('200', global => {
			switch (global.Game.time) {
				case 1: global.Memory.test = 'foo'; break;
				case 2: assert.equal(global.RawMemory._parsed, undefined); break;
			}
		});
		await tick(2);
	}));

	test('RawMemory._parsed = undefined skips saving', () => sim(async ({ sandbox, tick }) => {
		await using player = await sandbox('200', global => {
			switch (global.Game.time) {
				case 1:
					global.Memory.test = 1;
					global.RawMemory._parsed = undefined;
					break;
				case 2:
					assert.equal(global.Memory.test, undefined);
					global.Game.cpu.halt();
					break;
				case 4: assert.equal(global.RawMemory.get(), '');
			}
		});
		await tick(4);
	}));

	test('RawMemory._parsed assigns Memory', () => sim(async ({ sandbox, tick }) => {
		await using player = await sandbox('200', global => {
			switch (global.Game.time) {
				case 1: global.RawMemory._parsed = { test: 'foo' }; break;
				case 2: assert.equal(global.Memory.test, 'foo'); break;
			}
		});
		await tick(2);
	}));

	test('RawMemory.set works after accessing Memory', () => sim(async ({ sandbox, tick }) => {
		await using player = await sandbox('200', global => {
			switch (global.Game.time) {
				case 1:
					global.Memory.test = 1;
					global.RawMemory.set('string');
					global.RawMemory._parsed = undefined;
					break;
				case 2: global.Game.cpu.halt(); break;
				case 4: assert.equal(global.RawMemory.get(), 'string'); break;
			}
		});
		await tick(4);
	}));

	test('cached tick Memory survives RawMemory.set', () => sim(async ({ sandbox, tick }) => {
		await using player = await sandbox('200', global => {
			global.Memory.test = 'foo';
			global.RawMemory.set('{"test":"bar"}');
			assert.equal(global.Memory.test, 'foo');
		});
		await tick(1);
	}));

	test('RawMemory.set overrides RawMemory._parsed', () => sim(async ({ sandbox, tick }) => {
		await using player = await sandbox('200', global => {
			switch (global.Game.time) {
				case 1:
					global.RawMemory._parsed = { test: 'foo' };
					global.RawMemory.set(JSON.stringify({ test: 'bar' }));
					assert.equal(global.RawMemory._parsed, undefined);
					break;
				case 2: assert.equal(global.Memory.test, 'bar'); break;
			}
		});
		await tick(2);
	}));

	test('RawMemory._parsed overrides RawMemory.set', () => sim(async ({ sandbox, tick }) => {
		await using player = await sandbox('200', global => {
			switch (global.Game.time) {
				case 1:
					global.RawMemory.set(JSON.stringify({ test: 'bar' }));
					global.RawMemory._parsed = { test: 'foo' };
					break;
				case 2: assert.equal(global.Memory.test, 'foo'); break;
			}
		});
		await tick(2);
	}));

	test('RawMemory.set is reflected immediately', () => sim(async ({ sandbox, tick }) => {
		await using player = await sandbox('200', global => {
			global.RawMemory.set('{"test":"bar"}');
			assert.equal(global.RawMemory.get(), '{"test":"bar"}');
			assert.equal(global.Memory.test, 'bar');
		});
		await tick(1);
	}));

	test('Out-of-band segment write reaches an active segment', () => sim(async ({ shard, sandbox, tick }) => {
		await using player = await sandbox('200', global => {
			// The shard's starting time is an implementation detail; count ticks explicitly
			const tickCount = global.Memory.tick = (global.Memory.tick as number | undefined ?? 0) + 1;
			switch (tickCount) {
				case 1: global.RawMemory.setActiveSegments([ 0 ]); break;
				case 2: assert.equal(global.RawMemory.segments[0], ''); break;
				case 4: assert.equal(global.RawMemory.segments[0], 'foo'); break;
			}
		});
		await tick(2);
		// Simulates the memory-segment API endpoint: write the blob, then notify
		await saveMemorySegmentBlob(shard, '200', 0, utf16ToBuffer('foo'));
		await publicSegmentChannel(shard, '200').publish({ type: 'segment', id: 0 });
		await tick(2);
	}));
});
