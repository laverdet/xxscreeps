import assert from 'node:assert';
import { Shard } from 'xxscreeps/engine/db/index.js';
import { describe, test } from 'xxscreeps/test/context.js';
import { instantiateTestShard } from 'xxscreeps/test/import.js';

describe('Shard time safety', () => {
	test('pubsub tick updates runner shard.time independently', async () => {
		const { db, shard: mainShard } = await instantiateTestShard();

		// Create a second shard instance simulating the runner process
		const runnerShard = await Shard.connectWith(db, {
			name: 'shard0',
			data: 'local://keyval',
			pubsub: 'local://pubsub',
			scratch: 'local://scratch',
		});

		// Both start at time 1
		assert.equal(mainShard.time, 1);
		assert.equal(runnerShard.time, 1);

		// Main publishes tick — runner receives it via pubsub
		await mainShard.channel.publish({ type: 'tick', time: 2 });

		// Main's own time is NOT updated (excluded from its own publish)
		assert.equal(mainShard.time, 1);
		// Runner's time IS updated via the pubsub listener
		assert.equal(runnerShard.time, 2);

		runnerShard.disconnect();
		mainShard.disconnect();
		db.disconnect();
	});

	test('runner: rejects stale room reads after a later tick reuses the same buffer slot', async () => {
		const { db, shard: mainShard } = await instantiateTestShard();

		const runnerShard = await Shard.connectWith(db, {
			name: 'shard0',
			data: 'local://keyval',
			pubsub: 'local://pubsub',
			scratch: 'local://scratch',
		});

		// Tick 1 and tick 3 share the same backing storage slot (`room1/*`). Use
		// a different valid room blob as the tick 3 payload so the stale read
		// would observe incorrect-but-well-formed room data if allowed through.
		const [ tick1Blob, tick3Blob ] = await Promise.all([
			mainShard.loadRoomBlob('W1N1', 1),
			mainShard.loadRoomBlob('W1N9', 1),
		]);
		assert.notDeepEqual(tick1Blob, tick3Blob);

		// Simulate the processor advancing to tick 3 and overwriting the same
		// parity buffer that tick 1 used for W1N1.
		await Promise.all([
			mainShard.data.set('time', 3),
			mainShard.data.set('room1/W1N1', tick3Blob),
			mainShard.channel.publish({ type: 'tick', time: 3 }),
		]);
		assert.equal(runnerShard.time, 3);

		await assert.rejects(
			runnerShard.loadRoomBlob('W1N1', 1),
			/Invalid time: 1 \[current: 3\]/,
		);

		runnerShard.disconnect();
		mainShard.disconnect();
		db.disconnect();
	});
});
