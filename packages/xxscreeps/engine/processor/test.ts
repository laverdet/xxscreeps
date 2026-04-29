import type { ShardTickProcessor } from './symbols.js';
import { everyNTicks } from 'xxscreeps/engine/processor/index.js';
import { activeRoomsKey } from 'xxscreeps/engine/processor/model.js';
import { captureConsoleLog } from 'xxscreeps/test/console-capture.js';
import { assert, describe, simulate, test } from 'xxscreeps/test/index.js';
import { registerRoomTickProcessor } from './room.js';
import { roomTickProcessors, shardTickProcessors } from './symbols.js';

// Splice a callback out of the registry for test cleanup. The array is module-scope and shared
// with production registrations, so tests must not leave entries behind.
function unsplice<T>(arr: T[], fn: T) {
	const idx = arr.indexOf(fn);
	if (idx >= 0) arr.splice(idx, 1);
}

function installShard(fn: ShardTickProcessor): Disposable {
	shardTickProcessors.push(fn);
	return { [Symbol.dispose]() { unsplice(shardTickProcessors, fn); } };
}

function installRoom(fn: Parameters<typeof registerRoomTickProcessor>[0]): Disposable {
	roomTickProcessors.push(fn);
	return { [Symbol.dispose]() { unsplice(roomTickProcessors, fn); } };
}

const empty = simulate({
	W0N0: () => {},
	W1N1: () => {},
	W2N2: () => {},
	W3N3: () => {},
});

describe('registerShardTickProcessor', () => {

	test('fires once per tick', () => empty(async ({ tick }) => {
		let count = 0;
		using _install = installShard(() => { ++count; });
		await tick(5);
		assert.strictEqual(count, 5);
	}));

	test('runs after all room finalize', () => empty(async ({ tick, shard }) => {
		const order: string[] = [];
		using _room = installRoom((room, ctx) => {
			order.push(`room:${ctx.time}:${room.name}`);
			ctx.setActive();
		});
		using _shard = installShard((_shard2, ctx) => { order.push(`shard:${ctx.time}`); });
		// Activate W0N0 once to seed the active set; setActive() in the shim keeps it active.
		await shard.scratch.zadd(activeRoomsKey, [ [ 0, 'W0N0' ] ]);
		await tick(2);
		const room2 = order.indexOf('room:2:W0N0');
		const shard2 = order.indexOf('shard:2');
		const room3 = order.indexOf('room:3:W0N0');
		const shard3 = order.indexOf('shard:3');
		assert.ok(room2 >= 0 && shard2 >= 0 && room2 < shard2,
			`expected room:2 before shard:2, got ${JSON.stringify(order)}`);
		assert.ok(room3 >= 0 && shard3 >= 0 && room3 < shard3,
			`expected room:3 before shard:3, got ${JSON.stringify(order)}`);
	}));

	test('multiple callbacks fire in registration order', () => empty(async ({ tick }) => {
		const seen: string[] = [];
		using _a = installShard(() => { seen.push('A'); });
		using _b = installShard(() => { seen.push('B'); });
		using _c = installShard(() => { seen.push('C'); });
		await tick(1);
		assert.deepStrictEqual(seen, [ 'A', 'B', 'C' ]);
	}));

	test('shard processor throw isolated from siblings', () => empty(async ({ tick }) => {
		using _capture = captureConsoleLog();
		let counter = 0;
		using _a = installShard(() => { throw new Error('shard A boom'); });
		using _b = installShard(() => { ++counter; });
		await tick(3);
		assert.strictEqual(counter, 3);
	}));

	test('room processor throw isolated from siblings', () => empty(async ({ tick, shard }) => {
		using _capture = captureConsoleLog();
		let counter = 0;
		using _a = installRoom(() => { throw new Error('room A boom'); });
		using _b = installRoom((_room, ctx) => { ++counter; ctx.setActive(); });
		await shard.scratch.zadd(activeRoomsKey, [ [ 0, 'W0N0' ] ]);
		await tick(2);
		assert.strictEqual(counter, 2);
	}));

});

describe('everyNTicks', () => {

	test('fires only on modular ticks', () => empty(async ({ tick, shard }) => {
		const seen: number[] = [];
		using _install = installShard(everyNTicks(3, (_shard, ctx) => { seen.push(ctx.time); }));
		const start = shard.time;
		await tick(10);
		const expected: number[] = [];
		for (let time = start + 1; time <= start + 10; ++time) {
			if (time % 3 === 0) expected.push(time);
		}
		assert.deepStrictEqual(seen, expected);
	}));

});

describe('ShardProcessorContext', () => {

	test('activateRoom lands room on next tick', () => empty(async ({ tick }) => {
		const seen: number[] = [];
		using _room = installRoom(room => {
			if (room.name === 'W0N0') seen.push(NaN); // sentinel that should not appear
			if (room.name === 'W1N1') seen.push(2);
		});
		// Will activate W1N1 only on the first tick (time=2).
		let activated = false;
		using _shard = installShard((_shard2, ctx) => {
			if (!activated) {
				ctx.activateRoom('W1N1');
				activated = true;
			}
		});
		await tick(1);
		assert.deepStrictEqual(seen, []);
		await tick(1);
		assert.deepStrictEqual(seen, [ 2 ]);
	}));

	test('task awaited before next-tick snapshot', () => empty(async ({ tick }) => {
		const seen: string[] = [];
		using _room = installRoom((room, ctx) => {
			if (room.name === 'W2N2') {
				seen.push(`processed:${ctx.time}`);
			}
		});
		let scheduled = false;
		using _shard = installShard((_shard2, ctx) => {
			if (!scheduled) {
				ctx.task(new Promise<void>(resolve => {
					setTimeout(() => {
						ctx.activateRoom('W2N2');
						resolve();
					}, 10);
				}));
				scheduled = true;
			}
		});
		await tick(1);
		assert.strictEqual(seen.length, 0, 'task should not run W2N2 in same tick it was scheduled');
		await tick(1);
		// If the task was awaited before the next-tick snapshot, W2N2 lands in tick T+1's queue.
		assert.ok(seen.includes('processed:3'),
			`expected W2N2 processed at time 3, got ${JSON.stringify(seen)}`);
	}));

	test('wakeAt lands room at the specified tick', () => empty(async ({ tick, shard }) => {
		const seen: number[] = [];
		using _room = installRoom((room, ctx) => {
			if (room.name === 'W3N3') seen.push(ctx.time);
		});
		const startTime = shard.time;
		const target = startTime + 4; // schedule on first tick (time=startTime+1) → wake at startTime+4
		let scheduled = false;
		using _shard = installShard((_shard2, ctx) => {
			if (!scheduled) {
				ctx.wakeAt(target, 'W3N3');
				scheduled = true;
			}
		});
		// Run up through the target tick.
		await tick(target - startTime);
		assert.deepStrictEqual(seen, [ target ],
			`expected W3N3 to process exactly once at time ${target}, got ${JSON.stringify(seen)}`);
	}));

});
