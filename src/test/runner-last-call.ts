import assert from 'node:assert';
import { acquireIntentsForRoom, processRoomsSetKey, publishRunnerIntentsForRooms } from 'xxscreeps/engine/processor/model.js';
import { runnerLastCallKey } from 'xxscreeps/engine/runner/model.js';
import { describe, test } from 'xxscreeps/test/context.js';
import { instantiateTestShard } from 'xxscreeps/test/import.js';

describe('Runner last call', () => {
	test('late runner intents are discarded after last call', async () => {
		const { db, shard } = await instantiateTestShard();

		await Promise.all([
			shard.scratch.zadd(processRoomsSetKey(2), [ [ 1, 'W1N1' ] ]),
			shard.scratch.set(runnerLastCallKey(2), '1'),
		]);

		await publishRunnerIntentsForRooms(shard, '100', 2, [ 'W1N1' ], {
			W1N1: { local: { createConstructionSite: [ [ 'spawn', 25, 25, 'spawn1' ] ] }, object: {} },
		});

		assert.equal(await shard.scratch.zscore(processRoomsSetKey(2), 'W1N1'), 1);
		assert.deepEqual(await acquireIntentsForRoom(shard, 'W1N1'), []);

		shard.disconnect();
		db.disconnect();
	});

	test('forced closeout after last call decrements wait counts only once', async () => {
		const { db, shard } = await instantiateTestShard();

		await Promise.all([
			shard.scratch.zadd(processRoomsSetKey(2), [ [ 1, 'W1N1' ] ]),
			shard.scratch.set(runnerLastCallKey(2), '1'),
		]);

		await publishRunnerIntentsForRooms(shard, '100', 2, [ 'W1N1' ], {}, { force: true });
		assert.equal(await shard.scratch.zscore(processRoomsSetKey(2), 'W1N1'), 0);
		assert.deepEqual(await acquireIntentsForRoom(shard, 'W1N1'), []);

		await publishRunnerIntentsForRooms(shard, '100', 2, [ 'W1N1' ], {
			W1N1: { local: { createConstructionSite: [ [ 'spawn', 25, 25, 'spawn1' ] ] }, object: {} },
		});
		assert.equal(await shard.scratch.zscore(processRoomsSetKey(2), 'W1N1'), 0);
		assert.deepEqual(await acquireIntentsForRoom(shard, 'W1N1'), []);

		shard.disconnect();
		db.disconnect();
	});
});
