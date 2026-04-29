import type { Shard } from 'xxscreeps/engine/db/index.js';
import * as C from 'xxscreeps/game/constants/index.js';
import { captureConsoleLog, parseNotifyLines, withFakeNow } from 'xxscreeps/test/console-capture.js';
import { assert, describe, simulate, test } from 'xxscreeps/test/index.js';
import { dispatchQueuedNotifications } from './driver.js';
import { notifyHooks } from './hooks.js';
import { getNotifications, upsertNotification } from './model.js';
import { flush } from './notifications.js';
import { setNotifyPrefs } from './prefs.js';

const user = '100';

const empty = simulate({
	W0N0: () => {},
});

const getRows = (shard: Shard, userId: string) =>
	getNotifications(shard, userId).then(items => items.map(item => item.row));

describe('Game.notify', () => {

	test('returns OK on accept', () => empty(async ({ player }) => {
		await player(user, Game => {
			assert.strictEqual(Game.notify('hi'), C.OK);
		});
	}));

	test('21st call in a tick returns ERR_FULL', () => empty(async ({ player }) => {
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
		await player(user, Game => {
			for (let ii = 0; ii < 20; ++ii) {
				assert.strictEqual(Game.notify(`a${ii}`), C.OK);
			}
		});
		await tick();
		await player(user, Game => {
			for (let ii = 0; ii < 20; ++ii) {
				assert.strictEqual(Game.notify(`b${ii}`), C.OK,
					`tick N+1 call #${ii + 1} should accept`);
			}
		});
	}));

	test('notify intent lands a documented row', () => empty(async ({ player, shard }) => {
		await player(user, Game => {
			Game.notify('hi');
		});
		await dispatchQueuedNotifications(shard, user, flush());
		const rows = await getRows(shard, user);
		assert.strictEqual(rows.length, 1);
		const row = rows[0];
		assert.strictEqual(row.user, user);
		assert.strictEqual(row.message, 'hi');
		assert.strictEqual(typeof row.date, 'number');
		assert.strictEqual(row.count, 1);
		assert.strictEqual(row.type, 'msg');
	}));

	test('groupInterval=1 coalesces same-message calls in the bucket window', () => empty(async ({ player, shard }) => {
		using _frozen = withFakeNow(1_000_000);
		await player(user, Game => {
			Game.notify('hi', 1);
			Game.notify('hi', 1);
		});
		await dispatchQueuedNotifications(shard, user, flush());
		const rows = await getRows(shard, user);
		assert.strictEqual(rows.length, 1, 'same-bucket calls collapse to one row');
		assert.strictEqual(rows[0].message, 'hi');
		assert.strictEqual(rows[0].count, 2);
		// Stored `date` is the actual write time, not the bucket boundary.
		assert.strictEqual(rows[0].date, 1_000_000);
	}));

	test('600-char message stored as 500 chars', () => empty(async ({ player, shard }) => {
		await player(user, Game => {
			Game.notify('a'.repeat(600));
		});
		await dispatchQueuedNotifications(shard, user, flush());
		const rows = await getRows(shard, user);
		assert.strictEqual(rows.length, 1);
		assert.strictEqual(rows[0].message.length, 500);
		assert.strictEqual(rows[0].message, 'a'.repeat(500));
	}));

	test('groupInterval clamp ([0, 1440]) reflected in bucket placement', () => empty(async ({ player, shard }) => {
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

	test('message coercion via `${i.message}`', () => empty(async ({ player, shard }) => {
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
		using _frozen = withFakeNow(1_234_567);
		await player(user, Game => {
			assert.strictEqual((Game.notify as unknown as () => number)(), C.OK);
		});
		await dispatchQueuedNotifications(shard, user, flush());
		const rows = await getRows(shard, user);
		assert.strictEqual(rows.length, 1);
		assert.strictEqual(rows[0].message, 'undefined');
		assert.strictEqual(rows[0].date, 1_234_567);
		assert.strictEqual(rows[0].count, 1);
		assert.strictEqual(rows[0].type, 'msg');
	}));

	test('non-numeric groupInterval falls through to current-date', () => empty(async ({ player, shard }) => {
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

	// Advance shard.time to the next cadence-10 boundary so the subsequent `tick(10)` lands on
	// one. Tests start at shard.time=1, so the first cadence trigger is at time=10.
	async function alignToCadence(tick: (n: number) => Promise<void>, shardTime: number) {
		const next = (Math.floor(shardTime / 10) + 1) * 10;
		await tick(next - shardTime);
	}

	test('drains user at next cadence tick after upsert', () => empty(async ({ shard, tick }) => {
		using _clock = withFakeNow(baseTime);
		using stdout = captureConsoleLog();
		await alignToCadence(tick, shard.time);
		await seedRow(shard, userA, 'hi');
		await tick(10);
		const lines = parseNotifyLines(stdout.lines);
		assert.strictEqual(lines.length, 1);
		assert.strictEqual(lines[0].userId, userA);
		assert.strictEqual(lines[0].message, 'hi');
		assert.strictEqual(lines[0].count, 1);
		assert.strictEqual(lines[0].type, 'msg');
		assert.strictEqual((await getRows(shard, userA)).length, 0);
	}));

	test('drain does not fire between cadence boundaries', () => empty(async ({ shard, tick }) => {
		using _clock = withFakeNow(baseTime);
		using stdout = captureConsoleLog();
		await alignToCadence(tick, shard.time);
		await seedRow(shard, userA, 'hi');
		const time = shard.time;
		const next = (Math.floor(time / 10) + 1) * 10;
		await tick(next - time - 1);
		assert.strictEqual(parseNotifyLines(stdout.lines).length, 0,
			'no drain expected before reaching cadence tick');
		await tick(1);
		assert.strictEqual(parseNotifyLines(stdout.lines).length, 1, 'drain at cadence boundary');
	}));

	test('respects notifyPrefs.disabled (drops without emit)', () => empty(async ({ shard, tick }) => {
		using _clock = withFakeNow(baseTime);
		using stdout = captureConsoleLog();
		await alignToCadence(tick, shard.time);
		await setNotifyPrefs(shard, userA, { disabled: true });
		await seedRow(shard, userA, 'hi');
		await tick(10);
		assert.strictEqual(parseNotifyLines(stdout.lines).length, 0, 'disabled user → no emit');
		assert.strictEqual((await getRows(shard, userA)).length, 0, 'disabled user → rows dropped');
	}));

	test('respects notifyPrefs.interval throttle', () => empty(async ({ shard, tick }) => {
		using clock = withFakeNow(baseTime);
		using stdout = captureConsoleLog();
		await alignToCadence(tick, shard.time);
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
		assert.strictEqual(lines[1].message, 'second');
		assert.strictEqual((await getRows(shard, userA)).length, 0);
	}));

	test('drains multiple users independently', () => empty(async ({ shard, tick }) => {
		using _clock = withFakeNow(baseTime);
		using stdout = captureConsoleLog();
		await alignToCadence(tick, shard.time);
		await seedRow(shard, userA, 'a-msg');
		await seedRow(shard, userB, 'b-msg');
		await tick(10);
		const lines = parseNotifyLines(stdout.lines);
		assert.strictEqual(lines.length, 2);
		const byUser = new Map(lines.map(line => [ line.userId, line ]));
		assert.strictEqual(byUser.get(userA)?.message, 'a-msg');
		assert.strictEqual(byUser.get(userB)?.message, 'b-msg');
	}));

	test('one user throw does not block others', () => empty(async ({ shard, tick }) => {
		using _clock = withFakeNow(baseTime);
		using stdout = captureConsoleLog();
		using _hook = notifyHooks.register('sendUserNotifications', userId => {
			if (userId === userA) {
				throw new Error('transport boom');
			}
		});
		await alignToCadence(tick, shard.time);
		await seedRow(shard, userA, 'a-msg');
		await seedRow(shard, userB, 'b-msg');
		await tick(10);
		const aRows = await getRows(shard, userA);
		const bRows = await getRows(shard, userB);
		assert.strictEqual(aRows.length, 1, 'failing transport → A row stays');
		assert.strictEqual(bRows.length, 0, 'B row removed normally');
		const byUser = new Map(parseNotifyLines(stdout.lines).map(line => [ line.userId, line ]));
		assert.strictEqual(byUser.get(userB)?.message, 'b-msg');
	}));

});

describe('Default stdout transport', () => {

	test('emits one line per user with correct shape', () => empty(async ({ shard, tick }) => {
		using _clock = withFakeNow(10_000_000);
		using stdout = captureConsoleLog();
		const next = (Math.floor(shard.time / 10) + 1) * 10;
		await tick(next - shard.time);
		await upsertNotification(shard, userA, 'msg', 'hello', 0);
		await tick(10);
		const lines = parseNotifyLines(stdout.lines);
		assert.strictEqual(lines.length, 1);
		const line = lines[0];
		assert.strictEqual(line.event, 'notify');
		assert.strictEqual(line.userId, userA);
		assert.strictEqual(line.message, 'hello');
		assert.strictEqual(line.count, 1);
		assert.strictEqual(line.type, 'msg');
		assert.strictEqual(typeof line.date, 'number');
	}));

	test('fires with no extra listeners registered', () => empty(async ({ shard, tick }) => {
		using _clock = withFakeNow(10_000_000);
		using stdout = captureConsoleLog();
		const next = (Math.floor(shard.time / 10) + 1) * 10;
		await tick(next - shard.time);
		await upsertNotification(shard, userA, 'msg', 'solo', 0);
		await tick(10);
		assert.strictEqual(parseNotifyLines(stdout.lines).length, 1,
			'default stdout transport should fire even without operator-registered transports');
	}));

});
