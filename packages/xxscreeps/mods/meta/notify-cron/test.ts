import type { NotificationRow } from './model.js';
import type { Shard } from 'xxscreeps/engine/db/index.js';
import { setNotifyPrefs } from 'xxscreeps/mods/meta/notifications/prefs.js';
import { sendNotification } from 'xxscreeps/mods/meta/notifications/transport.js';
import { DeterministicClockForTesting } from 'xxscreeps/test/fixtures.js';
import { assert, describe, simulate, test } from 'xxscreeps/test/index.js';
import { consumeDueUsers, getAllRowsForTesting, hooks, upsertNotification } from './model.js';

const userA = '100';
const userB = '101';

const empty = simulate({
	W0N0: () => {},
});

// `hooks.register` returns nothing disposable, and `makeMapped` locks its listener list on the
// first call, so a consumer cannot be scoped to one test. One registers here; each test clears it.
const delivered: NotificationRow[] = [];
hooks.register('deliver', (shard, userId, rows) => {
	delivered.push(...rows);
	return Promise.resolve();
});

const seedRow = (shard: Shard, userId: string, message: string) =>
	upsertNotification(shard, userId, 'msg', message, 0);

describe('mods/meta/notify-cron', () => {

	const baseTime = 10_000_000;

	// This mod is the transport registered for the test process, so a plain `sendNotification`
	// exercises the whole registration path.
	test('transport persists a documented row', () => empty(async ({ shard }) => {
		using clock = new DeterministicClockForTesting({ start: 1_000_000, step: 0 });
		await sendNotification(shard, userA, 'msg', 'hi');
		const rows = await getAllRowsForTesting(shard, userA);
		assert.strictEqual(rows.length, 1);
		const [ row ] = rows;
		assert.strictEqual(row?.user, userA);
		assert.strictEqual(row.message, 'hi');
		assert.strictEqual(row.date, 1_000_000);
		assert.strictEqual(row.count, 1);
		assert.strictEqual(row.type, 'msg');
	}));

	test('groupInterval coalesces same-message calls', () => empty(async ({ shard }) => {
		using clock = new DeterministicClockForTesting({ start: 1_000_000, step: 0 });
		await upsertNotification(shard, userA, 'msg', 'hi', 1);
		await upsertNotification(shard, userA, 'msg', 'hi', 1);
		const rows = await getAllRowsForTesting(shard, userA);
		assert.strictEqual(rows.length, 1, 'same-bucket calls collapse to one row');
		assert.strictEqual(rows[0]?.message, 'hi');
		assert.strictEqual(rows[0].count, 2);
		// Stored `date` is the actual write time, not the bucket boundary.
		assert.strictEqual(rows[0].date, 1_000_000);
	}));

	test('Infinity group coalesces across any distance', () => empty(async ({ shard }) => {
		using clock = new DeterministicClockForTesting({ start: 1_000_000, step: 0 });
		await upsertNotification(shard, userA, 'msg', 'under attack', Infinity);
		clock.set(1_000_000 + 365 * 86_400_000);
		await upsertNotification(shard, userA, 'msg', 'under attack', Infinity);
		const rows = await getAllRowsForTesting(shard, userA);
		assert.strictEqual(rows.length, 1);
		assert.strictEqual(rows[0]?.count, 2);
		// First occurrence wins the recorded date.
		assert.strictEqual(rows[0].date, 1_000_000);
	}));

	test('row id does not collide across boundaries', () => empty(async ({ shard }) => {
		using clock = new DeterministicClockForTesting({ start: 1234, step: 0 });
		await upsertNotification(shard, userA, 'msg', '5hi', 0);
		clock.set(12345);
		await upsertNotification(shard, userA, 'msg', 'hi', 0);
		const rows = await getAllRowsForTesting(shard, userA);
		assert.strictEqual(rows.length, 2);
		const messages = rows.map(row => row.message).sort();
		assert.deepStrictEqual(messages, [ '5hi', 'hi' ]);
	}));

	test('recording schedules the user drain at the group deadline', () => empty(async ({ shard }) => {
		using clock = new DeterministicClockForTesting({ start: baseTime, step: 0 });
		await upsertNotification(shard, userA, 'msg', 'later', 60);
		assert.deepStrictEqual(await consumeDueUsers(shard, baseTime), [],
			'not due before the group deadline');
		const bucket = Math.ceil(baseTime / (60 * 60_000)) * (60 * 60_000);
		assert.deepStrictEqual(await consumeDueUsers(shard, bucket), [ userA ]);
		assert.deepStrictEqual(await consumeDueUsers(shard, bucket), [],
			'consuming pops the entry');
	}));

	test('due users pop independently', () => empty(async ({ shard }) => {
		using clock = new DeterministicClockForTesting({ start: baseTime, step: 0 });
		await upsertNotification(shard, userA, 'msg', 'a-msg', 0);
		await upsertNotification(shard, userB, 'msg', 'b-msg', 0);
		const dueUsers = await consumeDueUsers(shard, baseTime);
		assert.deepStrictEqual(dueUsers.sort(), [ userA, userB ]);
	}));

	// Delivery worker tests

	test('drains at cadence boundary with full row shape', () => empty(async ({ shard, tick }) => {
		using clock = new DeterministicClockForTesting({ start: baseTime, step: 0 });
		delivered.length = 0;
		await seedRow(shard, userA, 'hi');
		await tick(10);
		assert.strictEqual(delivered.length, 1);
		const [ row ] = delivered;
		assert.strictEqual(row?.user, userA);
		assert.strictEqual(row.message, 'hi');
		assert.strictEqual(row.count, 1);
		assert.strictEqual(row.type, 'msg');
		assert.strictEqual(typeof row.date, 'number');
		assert.strictEqual((await getAllRowsForTesting(shard, userA)).length, 0);
	}));

	test('no drain between cadence boundaries', () => empty(async ({ shard, tick }) => {
		using clock = new DeterministicClockForTesting({ start: baseTime, step: 0 });
		delivered.length = 0;
		await tick(1);
		await seedRow(shard, userA, 'hi');
		await tick(9);
		assert.strictEqual(delivered.length, 0,
			'no drain expected before reaching cadence tick');
		await tick(1);
		assert.strictEqual(delivered.length, 1, 'drain at cadence boundary');
	}));

	test('notifyPrefs.interval throttles', () => empty(async ({ shard, tick }) => {
		using clock = new DeterministicClockForTesting({ start: baseTime, step: 0 });
		delivered.length = 0;
		await seedRow(shard, userA, 'first');
		await tick(10);
		assert.strictEqual(delivered.length, 1);
		// lastNotifyDate is now baseTime.
		await seedRow(shard, userA, 'second');
		clock.increment(30 * 60_000);
		await tick(10);
		assert.strictEqual(delivered.length, 1, 'still under throttle');
		assert.strictEqual((await getAllRowsForTesting(shard, userA)).length, 1);
		// 30 + 31 clears the 60-minute throttle.
		clock.increment(31 * 60_000);
		await tick(10);
		assert.strictEqual(delivered.length, 2);
		assert.strictEqual(delivered[1]?.message, 'second');
		assert.strictEqual((await getAllRowsForTesting(shard, userA)).length, 0);
	}));

	// Every engine-generated notification takes this path, and its row indexes at `timeGroup` 0
	// rather than at a bucket boundary.
	test('coalesce-forever rows drain with their accumulated count', () => empty(async ({ shard, tick }) => {
		using clock = new DeterministicClockForTesting({ start: baseTime, step: 0 });
		delivered.length = 0;
		await upsertNotification(shard, userA, 'msg', 'under attack', Infinity);
		clock.increment(86_400_000);
		await upsertNotification(shard, userA, 'msg', 'under attack', Infinity);
		await tick(10);
		assert.strictEqual(delivered.length, 1);
		assert.strictEqual(delivered[0]?.message, 'under attack');
		assert.strictEqual(delivered[0].count, 2);
		assert.strictEqual((await getAllRowsForTesting(shard, userA)).length, 0);
	}));

	test('drains multiple users independently', () => empty(async ({ shard, tick }) => {
		using clock = new DeterministicClockForTesting({ start: baseTime, step: 0 });
		delivered.length = 0;
		await seedRow(shard, userA, 'a-msg');
		await seedRow(shard, userB, 'b-msg');
		await tick(10);
		assert.strictEqual(delivered.length, 2);
		const byUser = new Map(delivered.map(row => [ row.user, row ]));
		assert.strictEqual(byUser.get(userA)?.message, 'a-msg');
		assert.strictEqual(byUser.get(userB)?.message, 'b-msg');
	}));

	test('short group does not drag long group', () => empty(async ({ shard, tick }) => {
		using clock = new DeterministicClockForTesting({ start: baseTime, step: 0 });
		delivered.length = 0;
		// A cadence shorter than the gap between the two bucket boundaries, so delivery depends on
		// each row's group deadline rather than on the throttle.
		await setNotifyPrefs(shard.db, userA, { interval: 5 });
		await upsertNotification(shard, userA, 'msg', 'long', 60);
		// 1 is the smallest non-zero `groupInterval`.
		await upsertNotification(shard, userA, 'msg', 'short', 1);

		// Advance past the short group's bucket boundary; the long group's bucket is still ahead.
		const shortBucket = Math.ceil(baseTime / 60_000) * 60_000;
		clock.increment(shortBucket - baseTime + 1);
		await tick(10);
		assert.strictEqual(delivered.length, 1, 'only the short group fires at its bucket boundary');
		assert.strictEqual(delivered[0]?.message, 'short');
		const remaining = await getAllRowsForTesting(shard, userA);
		assert.strictEqual(remaining.length, 1, 'long group stays queued under its own deadline');
		assert.strictEqual(remaining[0]?.message, 'long');

		const longBucket = Math.ceil(baseTime / (60 * 60_000)) * (60 * 60_000);
		clock.increment(longBucket - shortBucket);
		await tick(10);
		assert.strictEqual(delivered.length, 2, 'long group fires once its deadline elapses');
		assert.strictEqual(delivered[1]?.message, 'long');
		assert.strictEqual((await getAllRowsForTesting(shard, userA)).length, 0);
	}));

});
