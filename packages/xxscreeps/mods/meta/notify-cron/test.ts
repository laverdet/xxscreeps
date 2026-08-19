import { sendNotification } from 'xxscreeps/mods/meta/notifications/transport.js';
import { DeterministicClockForTesting } from 'xxscreeps/test/fixtures.js';
import { assert, describe, simulate, test } from 'xxscreeps/test/index.js';
import { consumeDueUsers, getAllRowsForTesting, kRetentionMs, pruneExpiredNotifications, upsertNotification } from './model.js';

const userA = '100';
const userB = '101';

const empty = simulate({
	W0N0: () => {},
});

describe('mods/meta/notify-cron', () => {

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
		const baseTime = 10_000_000;
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
		using clock = new DeterministicClockForTesting({ start: 10_000_000, step: 0 });
		await upsertNotification(shard, userA, 'msg', 'a-msg', 0);
		await upsertNotification(shard, userB, 'msg', 'b-msg', 0);
		const dueUsers = await consumeDueUsers(shard, 10_000_000);
		assert.deepStrictEqual(dueUsers.sort(), [ userA, userB ]);
	}));

	test('prune drops rows past retention', () => empty(async ({ shard }) => {
		using clock = new DeterministicClockForTesting({ start: 1_000_000, step: 0 });
		await upsertNotification(shard, userA, 'msg', 'stale', 0);
		await pruneExpiredNotifications(shard, 1_000_000 + kRetentionMs + 1);
		assert.deepStrictEqual(await getAllRowsForTesting(shard, userA), []);
	}));

	test('prune keeps unexpired rows scheduled', () => empty(async ({ shard }) => {
		using clock = new DeterministicClockForTesting({ start: 1_000_000, step: 0 });
		await upsertNotification(shard, userA, 'msg', 'stale', 0);
		clock.set(2_000_000);
		await upsertNotification(shard, userA, 'msg', 'fresh', 0);
		await pruneExpiredNotifications(shard, 1_000_000 + kRetentionMs + 1);
		const rows = await getAllRowsForTesting(shard, userA);
		assert.deepStrictEqual(rows.map(row => row.message), [ 'fresh' ]);
		// The surviving row keeps the user scheduled for its own expiry.
		assert.deepStrictEqual(await consumeDueUsers(shard, 2_000_000), [ userA ]);
	}));

	test('coalesce-forever rows expire from their last occurrence', () => empty(async ({ shard }) => {
		using clock = new DeterministicClockForTesting({ start: 1_000_000, step: 0 });
		await upsertNotification(shard, userA, 'msg', 'under attack', Infinity);
		clock.set(5_000_000);
		await upsertNotification(shard, userA, 'msg', 'under attack', Infinity);
		await pruneExpiredNotifications(shard, 1_000_000 + kRetentionMs + 1);
		assert.strictEqual((await getAllRowsForTesting(shard, userA)).length, 1,
			'the second occurrence refreshed retention');
		await pruneExpiredNotifications(shard, 5_000_000 + kRetentionMs + 1);
		assert.deepStrictEqual(await getAllRowsForTesting(shard, userA), []);
	}));

});
