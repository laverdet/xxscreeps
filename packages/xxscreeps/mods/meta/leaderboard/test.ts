import * as User from 'xxscreeps/engine/db/user/index.js';
import { Fn } from 'xxscreeps/functional/fn.js';
import { writeRoomBucket } from 'xxscreeps/mods/meta/stats/model.js';
import { instantiateTestShard } from 'xxscreeps/test/import.js';
import { assert, describe, test } from 'xxscreeps/test/index.js';
import { readAllRanks, readPage, readRank, readSeasons, seasonName, seasonOf, writeScores } from './model.js';

const alice = '100';
const bob = '101';
const carol = '102';
// Two fixed points in adjacent calendar months, so season math is deterministic
const october = Date.UTC(2023, 9, 15);
const november = Date.UTC(2023, 10, 15);

describe('mods/meta/leaderboard', () => {
	test('a season is the calendar month its contributions fall in', () => {
		assert.strictEqual(seasonOf(october), '2023-10');
		assert.strictEqual(seasonOf(november), '2023-11');
		// Both edges of the month belong to it
		assert.strictEqual(seasonOf(Date.UTC(2023, 10, 0, 23, 59, 59, 999)), '2023-10');
		assert.strictEqual(seasonOf(Date.UTC(2023, 10, 1)), '2023-11');
		assert.strictEqual(seasonName('2023-11'), 'November 2023');
	});

	test('scores accumulate per mode into the season of the batch', async () => {
		await using testShard = await instantiateTestShard();
		const { db } = testShard.shard;
		await writeScores(db, [
			{ amount: 100, stat: 'energyControl', userId: alice },
			{ amount: 3, stat: 'powerProcessed', userId: alice },
			// Not every stat backs a leaderboard
			{ amount: 5000, stat: 'energyHarvested', userId: alice },
		], october);
		await writeScores(db, [ { amount: 50, stat: 'energyControl', userId: alice } ], october);
		// A later month is a separate board, not a continuation
		await writeScores(db, [ { amount: 7, stat: 'energyControl', userId: alice } ], november);

		assert.strictEqual((await readRank(db, 'world', '2023-10', alice))?.score, 150);
		assert.strictEqual((await readRank(db, 'power', '2023-10', alice))?.score, 3);
		assert.strictEqual((await readRank(db, 'world', '2023-11', alice))?.score, 7);
	});

	test('players are ranked by score, highest first, from rank zero', async () => {
		await using testShard = await instantiateTestShard();
		const { db } = testShard.shard;
		await writeScores(db, [
			{ amount: 10, stat: 'energyControl', userId: alice },
			{ amount: 30, stat: 'energyControl', userId: bob },
			// Tied with alice; ties break on user id, descending, in both storage providers
			{ amount: 10, stat: 'energyControl', userId: carol },
		], october);

		const { count, list } = await readPage(db, 'world', '2023-10', 0, 10);
		assert.strictEqual(count, 3);
		assert.deepStrictEqual(list, [
			{ rank: 0, score: 30, user: bob },
			{ rank: 1, score: 10, user: carol },
			{ rank: 2, score: 10, user: alice },
		]);
		// A player's own lookup agrees with the page they appear on
		assert.deepStrictEqual(await readRank(db, 'world', '2023-10', alice), { rank: 2, score: 10, user: alice });
		// Unranked in this mode, and unranked in a season which never ran
		assert.strictEqual(await readRank(db, 'power', '2023-10', alice), undefined);
		assert.strictEqual(await readRank(db, 'world', '2023-09', alice), undefined);
	});

	test('pages are offset windows of the same ranking', async () => {
		await using testShard = await instantiateTestShard();
		const { db } = testShard.shard;
		await writeScores(db, Fn.map(Fn.range(25), index => ({
			amount: index,
			stat: 'energyControl' as const,
			userId: `2${`${index}`.padStart(2, '0')}`,
		})), october);

		const { count, list } = await readPage(db, 'world', '2023-10', 10, 10);
		assert.strictEqual(count, 25);
		assert.strictEqual(list.length, 10);
		assert.strictEqual(list[0]!.rank, 10);
		assert.strictEqual(list[0]!.score, 14);
		assert.strictEqual(list[9]!.rank, 19);
		// The last page is short rather than padded
		assert.strictEqual((await readPage(db, 'world', '2023-10', 20, 10)).list.length, 5);
		assert.deepStrictEqual((await readPage(db, 'world', '2023-10', 25, 10)).list, []);
	});

	test('the season list is newest-first and always offers the current month', async () => {
		await using testShard = await instantiateTestShard();
		const { db } = testShard.shard;
		// Nothing has been scored yet, but the client still needs a season to land on
		assert.deepStrictEqual(await readSeasons(db, november), [ '2023-11' ]);

		await writeScores(db, [ { amount: 1, stat: 'energyControl', userId: alice } ], october);
		assert.deepStrictEqual(await readSeasons(db, november), [ '2023-11', '2023-10' ]);
		// Once the current month holds a score it isn't listed twice
		await writeScores(db, [ { amount: 1, stat: 'energyControl', userId: alice } ], november);
		assert.deepStrictEqual(await readSeasons(db, november), [ '2023-11', '2023-10' ]);
	});

	test('a player reads back every season they scored in', async () => {
		await using testShard = await instantiateTestShard();
		const { db } = testShard.shard;
		await writeScores(db, [
			{ amount: 10, stat: 'energyControl', userId: alice },
			{ amount: 20, stat: 'energyControl', userId: bob },
		], october);
		await writeScores(db, [ { amount: 5, stat: 'energyControl', userId: alice } ], november);

		assert.deepStrictEqual(await readAllRanks(db, 'world', alice, november), [
			{ rank: 0, score: 5, season: '2023-11', user: alice },
			{ rank: 1, score: 10, season: '2023-10', user: alice },
		]);
		// Seasons the player sat out are absent, not zero-scored
		assert.deepStrictEqual(await readAllRanks(db, 'world', bob, november), [
			{ rank: 0, score: 20, season: '2023-10', user: bob },
		]);
		assert.deepStrictEqual(await readAllRanks(db, 'power', alice, november), []);
	});

	test('removing a user leaves the boards they ranked on untouched', async () => {
		await using testShard = await instantiateTestShard();
		const { db } = testShard.shard;
		await writeScores(db, [
			{ amount: 30, stat: 'energyControl', userId: bob },
			{ amount: 10, stat: 'energyControl', userId: alice },
			{ amount: 2, stat: 'powerProcessed', userId: bob },
		], october);

		await User.remove(db, bob);
		// The season played out the way it played out, so nobody moves up
		assert.deepStrictEqual((await readPage(db, 'world', '2023-10', 0, 10)).list, [
			{ rank: 0, score: 30, user: bob },
			{ rank: 1, score: 10, user: alice },
		]);
		assert.deepStrictEqual(await readRank(db, 'power', '2023-10', bob), { rank: 0, score: 2, user: bob });
	});

	test('a flushed stats bucket lands on the leaderboard of its month', async () => {
		await using testShard = await instantiateTestShard();
		const { shard } = testShard;
		await writeRoomBucket(shard, 'W1N1', [
			{ amount: 42, stat: 'energyControl', userId: alice },
			{ amount: 1, stat: 'powerProcessed', userId: alice },
			{ amount: 500, stat: 'energyHarvested', userId: alice },
		], october);

		assert.strictEqual((await readRank(shard.db, 'world', '2023-10', alice))?.score, 42);
		assert.strictEqual((await readRank(shard.db, 'power', '2023-10', alice))?.score, 1);
		assert.deepStrictEqual(await readSeasons(shard.db, october), [ '2023-10' ]);
	});
});
