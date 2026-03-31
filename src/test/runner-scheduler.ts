import assert from 'node:assert';
import { acquireIntentsForRoom, processRoomsSetKey, publishRunnerIntentsForRooms, userToIntentRoomsSetKey, userToVisibleRoomsSetKey } from 'xxscreeps/engine/processor/model.js';
import { runnerLastCallKey, runnerUsersSetKey } from 'xxscreeps/engine/runner/model.js';
import { getServiceChannel } from 'xxscreeps/engine/service/index.js';
import { runRunnerTick, type RunnerTickInstance } from 'xxscreeps/engine/service/runner-core.js';
import { describe, test } from 'xxscreeps/test/context.js';
import { instantiateTestShard } from 'xxscreeps/test/import.js';
import { Deferred } from 'xxscreeps/utility/async.js';

describe('Runner scheduler', () => {
	test('admits a later tick while abandoned work drains and discards late results', async () => {
		const { db, shard } = await instantiateTestShard();
		const playerInstances = new Map<string, RunnerTickInstance>();
		const inFlightTasks = new Set<Promise<void>>();
		const startedTick2 = new Deferred<void>();
		const releaseTick2 = new Deferred<void>();
		const lateTick2Published = new Deferred<void>();
		const startedTick3 = new Deferred<void>();

		class FakeInstance implements RunnerTickInstance {
			constructor(public readonly username: string) {}

			abortTick() {}

			disconnect() {}

			async run(time: number, visibleRooms: string[], intentRooms: string[]) {
				assert.equal(visibleRooms.length, 1);
				if (this.username === 'Player 1') {
					assert.equal(time, 2);
					startedTick2.resolve();
					await releaseTick2.promise;
					await publishRunnerIntentsForRooms(shard, '100', time, intentRooms, {
						W1N1: { local: { createConstructionSite: [ [ 'spawn', 25, 25, 'late' ] ] }, object: {} },
					});
					lateTick2Published.resolve();
				} else {
					assert.equal(time, 3);
					startedTick3.resolve();
					await publishRunnerIntentsForRooms(shard, '101', time, intentRooms, {
						W1N9: { local: { createConstructionSite: [ [ 'spawn', 25, 25, 'ontime' ] ] }, object: {} },
					});
				}
			}
		}

		const createInstance = async (userId: string) =>
			new FakeInstance(userId === '100' ? 'Player 1' : 'Player 2');

		await Promise.all([
			shard.scratch.sadd(runnerUsersSetKey(2), [ '100' ]),
			shard.scratch.sadd(userToIntentRoomsSetKey('100'), [ 'W1N1' ]),
			shard.scratch.sadd(userToVisibleRoomsSetKey('100'), [ 'W1N1' ]),
			shard.scratch.zadd(processRoomsSetKey(2), [ [ 1, 'W1N1' ] ]),
			shard.scratch.sadd(runnerUsersSetKey(3), [ '101' ]),
			shard.scratch.sadd(userToIntentRoomsSetKey('101'), [ 'W1N9' ]),
			shard.scratch.sadd(userToVisibleRoomsSetKey('101'), [ 'W1N9' ]),
			shard.scratch.zadd(processRoomsSetKey(3), [ [ 1, 'W1N9' ] ]),
		]);

		const tick2 = runRunnerTick({
			createInstance,
			inFlightTasks,
			isEntry: false,
			maxConcurrency: 2,
			migrationTimeout: 0,
			playerInstances,
			shard,
			time: 2,
		});
		await startedTick2.promise;

		await Promise.all([
			shard.scratch.set(runnerLastCallKey(2), '1'),
			getServiceChannel(shard).publish({ type: 'lastCall', time: 2 }),
		]);
		await tick2;

		assert.equal(inFlightTasks.size, 1);
		assert.equal(playerInstances.has('100'), false);
		assert.equal(await shard.scratch.zscore(processRoomsSetKey(2), 'W1N1'), 0);
		assert.deepEqual(await acquireIntentsForRoom(shard, 'W1N1'), []);

		const tick3 = runRunnerTick({
			createInstance,
			inFlightTasks,
			isEntry: false,
			maxConcurrency: 2,
			migrationTimeout: 0,
			playerInstances,
			shard,
			time: 3,
		});
		await startedTick3.promise;

		releaseTick2.resolve();
		await lateTick2Published.promise;
		assert.deepEqual(await acquireIntentsForRoom(shard, 'W1N1'), []);

		await tick3;
		assert.equal(await shard.scratch.zscore(processRoomsSetKey(3), 'W1N9'), 0);
		assert.deepEqual(
			(await acquireIntentsForRoom(shard, 'W1N9')).map(entry => entry.userId),
			[ '101' ],
		);

		shard.disconnect();
		db.disconnect();
	});
});
