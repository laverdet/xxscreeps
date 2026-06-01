import type { Shard } from 'xxscreeps/engine/db/index.js';
import * as C from 'xxscreeps/game/constants/index.js';
import { captureConsoleLog, parseNotifyLines, withFakeNow } from 'xxscreeps/test/console-capture.js';
import { assert, describe, simulate, test } from 'xxscreeps/test/index.js';
import { dispatchQueuedNotifications } from './driver.js';
import { getDueNotifications, upsertNotification } from './model.js';
import { flush } from './notifications.js';
import { setNotifyPrefs } from './prefs.js';

const user = '100';

const empty = simulate({
	W0N0: () => {},
});

const getRows = (shard: Shard, userId: string) =>
	getDueNotifications(shard, userId, Infinity).then(items => items.map(item => item.row));

// The notify queue is module-level state that persists between tests (the test framework runs
// sequentially in one process and `simulate.tick()` does not fire runtimeConnector.send to drain
// it, the way prod does). Each test calls `flush()` first to start with a clean queue, mirroring
// the visual mod's "calls clear() to avoid shared state" pattern.
describe('Game.notify', () => {

	test('returns OK on accept', () => empty(async ({ player }) => {
		flush();
		await player(user, Game => {
			assert.strictEqual(Game.notify('hi'), C.OK);
		});
	}));

	test('21st call in a tick returns ERR_FULL', () => empty(async ({ player }) => {
		flush();
		await player(user, Game => {
			for (let ii = 0; ii < 20; ++ii) {
				assert.strictEqual(Game.notify(`msg${ii}`), C.OK,
					`call #${ii + 1} should accept`);
			}
			assert.strictEqual(Game.notify('overflow'), C.ERR_FULL,
				'21st call should be capped');
		});
	}));

	test('cap resets across ticks', () => empty(async ({ player, tick }) => {
		flush();
		await player(user, Game => {
			for (let ii = 0; ii < 20; ++ii) {
				assert.strictEqual(Game.notify(`a${ii}`), C.OK);
			}
		});
		// Simulate runtimeConnector.send draining at tick boundary (simulate.tick() doesn't).
		flush();
		await tick();
		await player(user, Game => {
			for (let ii = 0; ii < 20; ++ii) {
				assert.strictEqual(Game.notify(`b${ii}`), C.OK,
					`tick N+1 call #${ii + 1} should accept`);
			}
		});
	}));

	test('notify intent lands a documented row', () => empty(async ({ player, shard }) => {
		flush();
		await player(user, Game => {
			Game.notify('hi');
		});
		await dispatchQueuedNotifications(shard, user, flush());
		const rows = await getRows(shard, user);
		assert.strictEqual(rows.length, 1);
		const row = rows[0]!;
		assert.strictEqual(row.user, user);
		assert.strictEqual(row.message, 'hi');
		assert.strictEqual(typeof row.date, 'number');
		assert.strictEqual(row.count, 1);
		assert.strictEqual(row.type, 'msg');
	}));

	test('groupInterval=1 coalesces same-message calls in the bucket window', () => empty(async ({ player, shard }) => {
		flush();
		using _frozen = withFakeNow(1_000_000);
		await player(user, Game => {
			Game.notify('hi', 1);
			Game.notify('hi', 1);
		});
		await dispatchQueuedNotifications(shard, user, flush());
		const rows = await getRows(shard, user);
		assert.strictEqual(rows.length, 1, 'same-bucket calls collapse to one row');
		assert.strictEqual(rows[0]?.message, 'hi');
		assert.strictEqual(rows[0].count, 2);
		// Stored `date` is the actual write time, not the bucket boundary.
		assert.strictEqual(rows[0].date, 1_000_000);
	}));

	test('row id does not collide across time/message boundaries', () => empty(async ({ shard }) => {
		using clock = withFakeNow(1234);
		await upsertNotification(shard, user, 'msg', '5hi', 0);
		clock.set(12345);
		await upsertNotification(shard, user, 'msg', 'hi', 0);
		const rows = await getRows(shard, user);
		assert.strictEqual(rows.length, 2);
		const messages = rows.map(row => row.message).sort();
		assert.deepStrictEqual(messages, [ '5hi', 'hi' ]);
	}));

	test('600-char message stored as 500 chars', () => empty(async ({ player, shard }) => {
		flush();
		await player(user, Game => {
			Game.notify('a'.repeat(600));
		});
		await dispatchQueuedNotifications(shard, user, flush());
		const rows = await getRows(shard, user);
		assert.strictEqual(rows.length, 1);
		assert.strictEqual(rows[0]?.message.length, 500);
		assert.strictEqual(rows[0].message, 'a'.repeat(500));
	}));

	test('groupInterval clamp ([0, 1440]) reflected in bucket placement', () => empty(async ({ player, shard }) => {
		flush();
		using _frozen = withFakeNow(1_000_000);
		await player(user, Game => {
			Game.notify('low', -5);
			Game.notify('high', 5000);
		});
		await dispatchQueuedNotifications(shard, user, flush());
		const rows = await getRows(shard, user);
		// Two distinct row ids: low → groupInterval clamps to 0 (bucket = now); high → clamps to
		// 1440 (bucket = ceil(now/86_400_000) * 86_400_000). Different timeGroup → different hash.
		assert.strictEqual(rows.length, 2);
		const messages = rows.map(row => row.message).sort();
		assert.deepStrictEqual(messages, [ 'high', 'low' ]);
		// Both rows record actual write time as `date`, regardless of bucket.
		for (const row of rows) {
			assert.strictEqual(row.date, 1_000_000);
		}
	}));

	// eslint-disable-next-line no-template-curly-in-string
	test('message coercion via ${i.message}`', () => empty(async ({ player, shard }) => {
		flush();
		await player(user, Game => {
			Game.notify(null as unknown as string);
			Game.notify({ a: 1 } as unknown as string);
		});
		await dispatchQueuedNotifications(shard, user, flush());
		const rows = await getRows(shard, user);
		assert.strictEqual(rows.length, 2);
		const messages = rows.map(row => row.message).sort();
		assert.deepStrictEqual(messages, [ '[object Object]', 'null' ]);
	}));

	test('no-args Game.notify() stores "undefined" with current-date', () => empty(async ({ player, shard }) => {
		flush();
		using _frozen = withFakeNow(1_234_567);
		await player(user, Game => {
			assert.strictEqual((Game.notify as unknown as () => number)(), C.OK);
		});
		await dispatchQueuedNotifications(shard, user, flush());
		const rows = await getRows(shard, user);
		assert.strictEqual(rows.length, 1);
		assert.strictEqual(rows[0]?.message, 'undefined');
		assert.strictEqual(rows[0].date, 1_234_567);
		assert.strictEqual(rows[0].count, 1);
		assert.strictEqual(rows[0].type, 'msg');
	}));

	test('non-numeric groupInterval falls through to current-date', () => empty(async ({ player, shard }) => {
		flush();
		using _frozen = withFakeNow(1_234_567);
		await player(user, Game => {
			Game.notify('strInterval', 'abc' as unknown as number);
			Game.notify('nanInterval', NaN);
		});
		await dispatchQueuedNotifications(shard, user, flush());
		const rows = await getRows(shard, user);
		assert.strictEqual(rows.length, 2);
		for (const row of rows) {
			assert.strictEqual(row.date, 1_234_567,
				`${row.message} should bypass bucket math and land at Date.now()`);
		}
	}));

});

const userA = '100';
const userB = '101';

describe('Notification delivery worker', () => {

	const baseTime = 10_000_000;

	// Seed a row directly (bypasses the runner-connector save path) — these tests target the
	// delivery worker, not PR161's queueing.
	async function seedRow(shard: Shard, userId: string, message: string) {
		await upsertNotification(shard, userId, 'msg', message, 0);
	}

	test('drains user at cadence boundary with full row shape', () => empty(async ({ shard, tick }) => {
		using _clock = withFakeNow(baseTime);
		using stdout = captureConsoleLog();
		await seedRow(shard, userA, 'hi');
		await tick(10);
		const lines = parseNotifyLines(stdout.lines);
		assert.strictEqual(lines.length, 1);
		const line = lines[0]!;
		assert.strictEqual(line.event, 'notify');
		assert.strictEqual(line.userId, userA);
		assert.strictEqual(line.message, 'hi');
		assert.strictEqual(line.count, 1);
		assert.strictEqual(line.type, 'msg');
		assert.strictEqual(typeof line.date, 'number');
		assert.strictEqual((await getRows(shard, userA)).length, 0);
	}));

	test('drain does not fire between cadence boundaries', () => empty(async ({ shard, tick }) => {
		using _clock = withFakeNow(baseTime);
		using stdout = captureConsoleLog();
		await tick(1);
		await seedRow(shard, userA, 'hi');
		await tick(9);
		assert.strictEqual(parseNotifyLines(stdout.lines).length, 0,
			'no drain expected before reaching cadence tick');
		await tick(1);
		assert.strictEqual(parseNotifyLines(stdout.lines).length, 1, 'drain at cadence boundary');
	}));

	test('respects notifyPrefs.disabled (drops without emit)', () => empty(async ({ shard, tick }) => {
		using _clock = withFakeNow(baseTime);
		using stdout = captureConsoleLog();
		await setNotifyPrefs(shard, userA, { disabled: true });
		await seedRow(shard, userA, 'hi');
		await tick(10);
		assert.strictEqual(parseNotifyLines(stdout.lines).length, 0, 'disabled user → no emit');
		assert.strictEqual((await getRows(shard, userA)).length, 0, 'disabled user → rows dropped');
	}));

	test('respects notifyPrefs.interval throttle', () => empty(async ({ shard, tick }) => {
		using clock = withFakeNow(baseTime);
		using stdout = captureConsoleLog();
		await seedRow(shard, userA, 'first');
		await tick(10);
		assert.strictEqual(parseNotifyLines(stdout.lines).length, 1);
		// lastNotifyDate now = baseTime. Add second row, advance 30 min (under default 60-min throttle).
		await seedRow(shard, userA, 'second');
		clock.advance(30 * 60_000);
		await tick(10);
		assert.strictEqual(parseNotifyLines(stdout.lines).length, 1, 'still under throttle');
		assert.strictEqual((await getRows(shard, userA)).length, 1);
		// Advance past the 60-min throttle.
		clock.advance(31 * 60_000);
		await tick(10);
		const lines = parseNotifyLines(stdout.lines);
		assert.strictEqual(lines.length, 2);
		assert.strictEqual(lines[1]!.message, 'second');
		assert.strictEqual((await getRows(shard, userA)).length, 0);
	}));

	test('drains multiple users independently', () => empty(async ({ shard, tick }) => {
		using _clock = withFakeNow(baseTime);
		using stdout = captureConsoleLog();
		await seedRow(shard, userA, 'a-msg');
		await seedRow(shard, userB, 'b-msg');
		await tick(10);
		const lines = parseNotifyLines(stdout.lines);
		assert.strictEqual(lines.length, 2);
		const byUser = new Map(lines.map(line => [ line.userId, line ]));
		assert.strictEqual(byUser.get(userA)?.message, 'a-msg');
		assert.strictEqual(byUser.get(userB)?.message, 'b-msg');
	}));

	test('short group does not drag long group when its deadline elapses', () => empty(async ({ shard, tick }) => {
		using clock = withFakeNow(baseTime);
		using stdout = captureConsoleLog();
		// Disable the per-user throttle so delivery depends only on each row's group deadline.
		await setNotifyPrefs(shard, userA, { interval: 0 });
		// 60-minute group → due at the next 60-minute boundary.
		await upsertNotification(shard, userA, 'msg', 'long', 60);
		// 1-minute group (smallest non-zero `groupInterval`) → due at the next 1-minute boundary.
		await upsertNotification(shard, userA, 'msg', 'short', 1);

		// Advance past the short group's bucket boundary; the long group's bucket is still ahead.
		const shortBucket = Math.ceil(baseTime / 60_000) * 60_000;
		clock.advance(shortBucket - baseTime + 1);
		await tick(10);
		const firstPass = parseNotifyLines(stdout.lines);
		assert.strictEqual(firstPass.length, 1, 'only the short group fires at its bucket boundary');
		assert.strictEqual(firstPass[0]!.message, 'short');
		const remaining = await getRows(shard, userA);
		assert.strictEqual(remaining.length, 1, 'long group stays queued under its own deadline');
		assert.strictEqual(remaining[0]!.message, 'long');

		// Advance past the 60-minute group's bucket boundary.
		const longBucket = Math.ceil(baseTime / (60 * 60_000)) * (60 * 60_000);
		clock.advance(longBucket - shortBucket);
		await tick(10);
		const secondPass = parseNotifyLines(stdout.lines);
		assert.strictEqual(secondPass.length, 2, 'long group fires once its deadline elapses');
		assert.strictEqual(secondPass[1]!.message, 'long');
		assert.strictEqual((await getRows(shard, userA)).length, 0);
	}));

});
