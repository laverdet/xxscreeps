import { instantiateTestShard } from 'xxscreeps/test/import.js';
import { assert, describe, test } from 'xxscreeps/test/index.js';
import {
	readPunchcard, readRoomPunchcard, readRoomTotals, readTotals,
	removeAllForUser, statNames, writeRoomStats, writeStats,
} from './model.js';

const alice = 'aaaaaaaaaaaa';
// A fixed wall-clock anchor so bucket math is deterministic across the test.
const t0 = 1_700_000_000_000;
const hour = 3_600_000;

describe('stats model', () => {
	test('totals sum contributions within the interval window', async () => {
		await using testShard = await instantiateTestShard();
		const { db } = testShard;
		await writeStats(db.data, alice, [ [ 'energyHarvested', 100 ], [ 'energyControl', 5 ] ], t0);
		// A second write in the same bucket accumulates (also mimics a second shard writing).
		await writeStats(db.data, alice, [ [ 'energyHarvested', 50 ] ], t0);

		const totals = await readTotals(db, alice, 8, t0);
		assert.strictEqual(totals.energyHarvested, 150);
		assert.strictEqual(totals.energyControl, 5);
		// Every series is present, defaulting to zero.
		assert.strictEqual(totals.powerProcessed, 0);
		assert.strictEqual(Object.keys(totals).length, statNames.length);
	});

	test('contributions age out of the shorter window but remain in the longer one', async () => {
		await using testShard = await instantiateTestShard();
		const { db } = testShard;
		await writeStats(db.data, alice, [ [ 'energyHarvested', 100 ] ], t0);

		// Two hours later: outside the ~1h (interval 8) window, still inside the 7d (interval 1440) one.
		const later = t0 + 2 * hour;
		assert.strictEqual((await readTotals(db, alice, 8, later)).energyHarvested, 0);
		assert.strictEqual((await readTotals(db, alice, 1440, later)).energyHarvested, 100);
	});

	test('punchcard exposes the per-bucket series oldest-first', async () => {
		await using testShard = await instantiateTestShard();
		const { db } = testShard;
		// Two harvests one interval-8 bucket (8 min) apart land in adjacent, most-recent buckets.
		await writeStats(db.data, alice, [ [ 'energyHarvested', 10 ] ], t0 - 8 * 60_000);
		await writeStats(db.data, alice, [ [ 'energyHarvested', 20 ] ], t0);
		const series = await readPunchcard(db, alice, 8, 'energyHarvested', t0);
		assert.strictEqual(series.length, 8);
		assert.deepStrictEqual(series.slice(-2), [ 10, 20 ]);
	});

	test('removeAllForUser drops every series', async () => {
		await using testShard = await instantiateTestShard();
		const { db } = testShard;
		await writeStats(db.data, alice, [ [ 'energyHarvested', 100 ] ], t0);
		await removeAllForUser(db, alice);
		assert.strictEqual((await readTotals(db, alice, 1440, t0)).energyHarvested, 0);
	});

	test('room series aggregate and read back independently of user series', async () => {
		await using testShard = await instantiateTestShard();
		const { shard } = testShard;
		await writeRoomStats(shard.data, 'W1N1', [ [ 'energyHarvested', 30 ] ], t0);
		await writeRoomStats(shard.data, 'W1N1', [ [ 'energyHarvested', 12 ] ], t0);
		assert.strictEqual((await readRoomTotals(shard.data, 'W1N1', 8, t0)).energyHarvested, 42);
		const series = await readRoomPunchcard(shard.data, 'W1N1', 8, 'energyHarvested', t0);
		assert.strictEqual(series.length, 8);
		assert.strictEqual(series.at(-1), 42);
		// A different room shares nothing.
		assert.strictEqual((await readRoomTotals(shard.data, 'W2N2', 8, t0)).energyHarvested, 0);
	});
});
