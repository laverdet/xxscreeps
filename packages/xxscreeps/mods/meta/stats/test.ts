import { mappedPrimitiveComparator } from 'xxscreeps/functional/comparator.js';
import { Fn } from 'xxscreeps/functional/fn.js';
import * as C from 'xxscreeps/game/constants/index.js';
import { iterateNeighbors } from 'xxscreeps/game/position.js';
import { create as createCreep } from 'xxscreeps/mods/classic/creep/creep.js';
import { instantiateTestShard } from 'xxscreeps/test/import.js';
import { assert, describe, simulate, test } from 'xxscreeps/test/index.js';
import {
	parseStatLayer, pendingBucketOffset, readRoomLayer, readRoomPunchcard, readRoomTotals,
	readUserTotals, removeAllForUser, statIntervals, writeRoomBucket,
} from './model.js';
import { statNames } from './schema.js';

const alice = '100';
const bob = '101';
// A fixed wall-clock anchor so bucket math is deterministic across the test
const t0 = 1_700_000_000_000;
const hour = 3_600_000;

describe('mod/meta/stats', () => {
	const sim = simulate({
		W1N1: room => {
			const source = room.find(C.FIND_SOURCES)[0]!;
			source.energy = 3000;
			const terrain = room.getTerrain();
			const [ first, second ] = Fn.reject(
				iterateNeighbors(source.pos), pos => terrain.get(pos.x, pos.y) === C.TERRAIN_MASK_WALL);
			room['#insertObject'](createCreep(first!, [ C.WORK, C.WORK, C.CARRY, C.MOVE ], 'harvester', alice));
			room['#insertObject'](createCreep(second!, [ C.WORK, C.CARRY, C.MOVE ], 'poacher', bob));
		},
	});

	test('contributions coalesce per (user, stat) on the room blob', () => sim(async ({ player, tick }) => {
		const perTick = 2 * C.HARVEST_POWER;

		await player(alice, Game => {
			const source = Game.rooms.W1N1?.find(C.FIND_SOURCES)[0];
			assert.strictEqual(Game.creeps.harvester?.harvest(source!), C.OK);
		});
		await tick();
		let statsTime = 0;
		await player(alice, Game => {
			const [ stats, aggregate ] = Game.rooms.W1N1?.['#userStats'] ?? [];
			assert.ok(stats);
			assert.strictEqual(aggregate, undefined);
			assert.strictEqual(stats.userId, alice);
			assert.strictEqual(stats.stat, 'energyHarvested');
			assert.strictEqual(stats.amount, perTick);
			statsTime = Game.rooms.W1N1?.['#userStatsTime'] ?? 0;
			assert.ok(statsTime > 0);
			// A second harvest accumulates into the same entry
			const source = Game.rooms.W1N1?.find(C.FIND_SOURCES)[0];
			assert.strictEqual(Game.creeps.harvester?.harvest(source!), C.OK);
		});
		await tick();
		await player(alice, Game => {
			const [ stats, aggregate ] = Game.rooms.W1N1?.['#userStats'] ?? [];
			assert.ok(stats);
			assert.strictEqual(aggregate, undefined);
			assert.strictEqual(stats.amount, 2 * perTick);
			// The bucket timestamp is stamped once
			assert.strictEqual(Game.rooms.W1N1?.['#userStatsTime'], statsTime);
		});
	}));

	test('contributions are attributed per user', () => sim(async ({ player, tick }) => {
		await player(alice, Game => {
			const source = Game.rooms.W1N1?.find(C.FIND_SOURCES)[0];
			assert.strictEqual(Game.creeps.harvester?.harvest(source!), C.OK);
		});
		await player(bob, Game => {
			const source = Game.rooms.W1N1?.find(C.FIND_SOURCES)[0];
			assert.strictEqual(Game.creeps.poacher?.harvest(source!), C.OK);
		});
		await tick();
		await player(alice, Game => {
			const stats = Game.rooms.W1N1?.['#userStats'];
			assert.deepStrictEqual(
				stats?.map(entry => [ entry.userId, entry.stat, entry.amount ] as const)
					.sort(mappedPrimitiveComparator(entry => entry[0])),
				[ [ alice, 'energyHarvested', 2 * C.HARVEST_POWER ], [ bob, 'energyHarvested', C.HARVEST_POWER ] ]);
		});
	}));

	test('an aged bucket is flushed to redis and cleared from the blob', () => sim(async ({ player, poke, shard, tick }) => {
		const perTick = 2 * C.HARVEST_POWER;
		await player(alice, Game => {
			const source = Game.rooms.W1N1?.find(C.FIND_SOURCES)[0];
			assert.strictEqual(Game.creeps.harvester?.harvest(source!), C.OK);
		});
		await tick();
		// Backdate the bucket so the flush deadline (next boundary of the finest interval, plus the
		// room's jitter) has certainly passed
		await poke('W1N1', undefined, (_game, room) => {
			room['#userStatsTime'] = Date.now() - 20 * 60_000;
		});
		await tick();
		await player(alice, Game => {
			const room = Game.rooms.W1N1;
			assert.strictEqual(room?.['#userStats'].length, 0);
			assert.strictEqual(room['#userStatsTime'], 0);
		});
		// Landed in both the per-user account series and the per-room series
		assert.strictEqual((await readUserTotals(shard.db, alice, 1440)).energyHarvested, perTick);
		assert.strictEqual((await readRoomTotals(shard.data, 'W1N1', alice, 1440)).energyHarvested, perTick);
		assert.deepStrictEqual(
			await readRoomLayer(shard.data, 'W1N1', 1440, 'energyHarvested'),
			[ { user: alice, value: perTick } ]);
	}));

	test('contributions from the flush tick begin a fresh bucket', () => sim(async ({ player, poke, shard, tick }) => {
		const perTick = 2 * C.HARVEST_POWER;
		await player(alice, Game => {
			const source = Game.rooms.W1N1?.find(C.FIND_SOURCES)[0];
			assert.strictEqual(Game.creeps.harvester?.harvest(source!), C.OK);
		});
		await tick();
		await poke('W1N1', undefined, (_game, room) => {
			room['#userStatsTime'] = Date.now() - 20 * 60_000;
		});
		// Harvest again on the tick that flushes: the flush snapshots before intents run, so this
		// tick's contribution must survive on the blob instead of being wiped with the batch
		await player(alice, Game => {
			const source = Game.rooms.W1N1?.find(C.FIND_SOURCES)[0];
			assert.strictEqual(Game.creeps.harvester?.harvest(source!), C.OK);
		});
		await tick();
		await player(alice, Game => {
			const [ entry ] = Game.rooms.W1N1?.['#userStats'] ?? [];
			assert.strictEqual(entry?.amount, perTick);
			assert.ok((Game.rooms.W1N1?.['#userStatsTime'] ?? 0) > 0);
		});
		// Only the first tick's batch was flushed
		assert.strictEqual((await readUserTotals(shard.db, alice, 1440)).energyHarvested, perTick);
	}));

	test('totals sum contributions within the interval window', async () => {
		await using testShard = await instantiateTestShard();
		const { shard } = testShard;
		await writeRoomBucket(shard, 'W1N1', [
			{ amount: 100, stat: 'energyHarvested', userId: alice },
			{ amount: 5, stat: 'energyControl', userId: alice },
		], t0);
		// A second write in the same bucket accumulates (also mimics a second shard writing)
		await writeRoomBucket(shard, 'W1N1', [ { amount: 50, stat: 'energyHarvested', userId: alice } ], t0);

		const totals = await readUserTotals(shard.db, alice, 8, t0);
		assert.strictEqual(totals.energyHarvested, 150);
		assert.strictEqual(totals.energyControl, 5);
		// Every series is present, defaulting to zero
		assert.strictEqual(totals.powerProcessed, 0);
		assert.strictEqual(Object.keys(totals).length, statNames.length);
	});

	test('contributions age out of the shorter window but remain in the longer one', async () => {
		await using testShard = await instantiateTestShard();
		const { shard } = testShard;
		await writeRoomBucket(shard, 'W1N1', [ { amount: 100, stat: 'energyHarvested', userId: alice } ], t0);

		// Two hours later: outside the ~1h (interval 8) window, still inside the 7d (interval 1440) one
		const later = t0 + 2 * hour;
		assert.strictEqual((await readUserTotals(shard.db, alice, 8, later)).energyHarvested, 0);
		assert.strictEqual((await readUserTotals(shard.db, alice, 1440, later)).energyHarvested, 100);
		assert.strictEqual((await readRoomTotals(shard.data, 'W1N1', alice, 8, later)).energyHarvested, 0);
		assert.strictEqual((await readRoomTotals(shard.data, 'W1N1', alice, 1440, later)).energyHarvested, 100);
	});

	test('punchcard exposes the per-bucket series oldest-first', async () => {
		await using testShard = await instantiateTestShard();
		const { shard } = testShard;
		// Two dumps one interval-8 bucket (8 min) apart land in adjacent, most-recent buckets
		await writeRoomBucket(shard, 'W1N1', [ { amount: 10, stat: 'energyHarvested', userId: alice } ], t0 - 8 * 60_000);
		await writeRoomBucket(shard, 'W1N1', [ { amount: 20, stat: 'energyHarvested', userId: alice } ], t0);
		const series = await readRoomPunchcard(shard.data, 'W1N1', alice, 8, 'energyHarvested', t0);
		assert.strictEqual(series.length, 8);
		assert.deepStrictEqual(series.slice(-2), [ 10, 20 ]);
	});

	test('room layer ranks contributing users and reclaims aged-out fields on the next dump', async () => {
		await using testShard = await instantiateTestShard();
		const { shard } = testShard;
		await writeRoomBucket(shard, 'W1N1', [
			{ amount: 100, stat: 'energyHarvested', userId: alice },
			{ amount: 40, stat: 'energyControl', userId: alice },
			{ amount: 250, stat: 'energyHarvested', userId: bob },
		], t0);
		assert.deepStrictEqual(
			await readRoomLayer(shard.data, 'W1N1', 8, 'energyHarvested', t0),
			[ { user: bob, value: 250 }, { user: alice, value: 100 } ]);
		// A user active in the room but not in the requested stat is dropped
		assert.deepStrictEqual(await readRoomLayer(shard.data, 'W1N1', 8, 'powerProcessed', t0), []);
		// Two hours on, the contributions have aged out of the 1h window entirely
		assert.deepStrictEqual(await readRoomLayer(shard.data, 'W1N1', 8, 'energyHarvested', t0 + 2 * hour), []);
		// Eight days later a dump reclaims every expired field, in every interval, in the room hash
		// and the writing user's account hash alike
		const later = t0 + 8 * 24 * hour;
		await writeRoomBucket(shard, 'W1N1', [ { amount: 70, stat: 'energyHarvested', userId: bob } ], later);
		assert.deepStrictEqual(
			await readRoomLayer(shard.data, 'W1N1', 1440, 'energyHarvested', later),
			[ { user: bob, value: 70 } ]);
		for (const interval of statIntervals) {
			assert.strictEqual((await shard.data.hKeys(`room/W1N1/stats/${interval}`)).length, 1);
			assert.strictEqual((await shard.db.data.hKeys(`user/${bob}/stats/${interval}`)).length, 1);
		}
	});

	test('removeAllForUser drops the account-level series', async () => {
		await using testShard = await instantiateTestShard();
		const { shard } = testShard;
		await writeRoomBucket(shard, 'W1N1', [ { amount: 100, stat: 'energyHarvested', userId: alice } ], t0);
		await removeAllForUser(shard.db, alice);
		assert.strictEqual((await readUserTotals(shard.db, alice, 1440, t0)).energyHarvested, 0);
	});

	test('pendingBucketOffset places the blob bucket inside the window', () => {
		// A freshly-stamped bucket sits in the newest slot
		assert.strictEqual(pendingBucketOffset(8, t0, t0), 7);
		// One bucket earlier, one slot down
		assert.strictEqual(pendingBucketOffset(8, t0 - 8 * 60_000, t0), 6);
		// Aged out of the window entirely
		assert.strictEqual(pendingBucketOffset(8, t0 - 2 * hour, t0), undefined);
	});

	test('parseStatLayer splits the client\'s `<stat><interval>` layer name', () => {
		assert.deepStrictEqual(parseStatLayer('energyHarvested8'), { stat: 'energyHarvested', interval: 8 });
		assert.deepStrictEqual(parseStatLayer('energyControl1440'), { stat: 'energyControl', interval: 1440 });
		assert.strictEqual(parseStatLayer('energyHarvested7'), undefined);
		assert.strictEqual(parseStatLayer('bogus8'), undefined);
	});
});
