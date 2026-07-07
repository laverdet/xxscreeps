import { instantiateTestShard } from 'xxscreeps/test/import.js';
import { assert, describe, test } from 'xxscreeps/test/index.js';
import {
	parseStatLayer, pruneRoomContributors, readRoomLayer, readRoomPunchcard, readRoomTotals,
	readTotals, removeAllForUser, statNames, writeRoomStats, writeStats,
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
		const { shard } = testShard;
		// Two harvests one interval-8 bucket (8 min) apart land in adjacent, most-recent buckets.
		await writeRoomStats(shard.data, 'W1N1', alice, [ [ 'energyHarvested', 10 ] ], t0 - 8 * 60_000);
		await writeRoomStats(shard.data, 'W1N1', alice, [ [ 'energyHarvested', 20 ] ], t0);
		const series = await readRoomPunchcard(shard.data, 'W1N1', alice, 8, 'energyHarvested', t0);
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

	test('per-room-user series read back per user, independent of other rooms', async () => {
		await using testShard = await instantiateTestShard();
		const { shard } = testShard;
		await writeRoomStats(shard.data, 'W1N1', alice, [ [ 'energyHarvested', 30 ] ], t0);
		await writeRoomStats(shard.data, 'W1N1', alice, [ [ 'energyHarvested', 12 ] ], t0);
		assert.strictEqual((await readRoomTotals(shard.data, 'W1N1', alice, 8, t0)).energyHarvested, 42);
		const series = await readRoomPunchcard(shard.data, 'W1N1', alice, 8, 'energyHarvested', t0);
		assert.strictEqual(series.length, 8);
		assert.strictEqual(series.at(-1), 42);
		// A different room shares nothing.
		assert.strictEqual((await readRoomTotals(shard.data, 'W2N2', alice, 8, t0)).energyHarvested, 0);
	});

	test('room layer ranks contributing users and drops zero/aged-out ones', async () => {
		await using testShard = await instantiateTestShard();
		const { shard } = testShard;
		const bob = 'bbbbbbbbbbbb';
		await writeRoomStats(shard.data, 'W1N1', alice, [ [ 'energyHarvested', 100 ] ], t0);
		await writeRoomStats(shard.data, 'W1N1', bob, [ [ 'energyHarvested', 250 ] ], t0);
		const layer = await readRoomLayer(shard.data, 'W1N1', 8, 'energyHarvested', t0);
		assert.deepStrictEqual(layer, [ { user: bob, value: 250 }, { user: alice, value: 100 } ]);
		// Ranking is identical at the widest interval, over its 7d window.
		assert.deepStrictEqual(
			await readRoomLayer(shard.data, 'W1N1', 1440, 'energyHarvested', t0),
			[ { user: bob, value: 250 }, { user: alice, value: 100 } ]);
		// Two hours on, alice's contribution has aged out of the 1h window entirely.
		assert.deepStrictEqual(await readRoomLayer(shard.data, 'W1N1', 8, 'energyHarvested', t0 + 2 * hour), []);
	});

	test('a user active in the room but not in the requested stat is dropped from the layer', async () => {
		await using testShard = await instantiateTestShard();
		const { shard } = testShard;
		const bob = 'bbbbbbbbbbbb';
		// Both are live contributors, but only bob has any of the requested stat this window.
		await writeRoomStats(shard.data, 'W1N1', alice, [ [ 'energyControl', 40 ] ], t0);
		await writeRoomStats(shard.data, 'W1N1', bob, [ [ 'energyHarvested', 70 ] ], t0);
		assert.deepStrictEqual(
			await readRoomLayer(shard.data, 'W1N1', 8, 'energyHarvested', t0),
			[ { user: bob, value: 70 } ]);
	});

	test('pruneRoomContributors reclaims users aged out of the widest window, keeping live ones', async () => {
		await using testShard = await instantiateTestShard();
		const { shard } = testShard;
		const bob = 'bbbbbbbbbbbb';
		await writeRoomStats(shard.data, 'W1N1', alice, [ [ 'energyHarvested', 100 ] ], t0);
		// Eight days later bob contributes; alice's last activity is now outside the 7d window.
		const later = t0 + 8 * 24 * hour;
		await writeRoomStats(shard.data, 'W1N1', bob, [ [ 'energyHarvested', 250 ] ], later);
		await pruneRoomContributors(shard.data, 'W1N1', later);
		// alice is gone from the contributor index; only bob is enumerated at the widest interval.
		assert.deepStrictEqual(
			await readRoomLayer(shard.data, 'W1N1', 1440, 'energyHarvested', later),
			[ { user: bob, value: 250 } ]);
	});

	test('parseStatLayer splits the client\'s `<stat><interval>` layer name', () => {
		assert.deepStrictEqual(parseStatLayer('energyHarvested8'), { stat: 'energyHarvested', interval: 8 });
		assert.deepStrictEqual(parseStatLayer('energyControl1440'), { stat: 'energyControl', interval: 1440 });
		assert.strictEqual(parseStatLayer('energyHarvested7'), undefined);
		assert.strictEqual(parseStatLayer('bogus8'), undefined);
	});
});
