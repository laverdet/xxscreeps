import assert from 'node:assert';
import { Shard } from 'xxscreeps/engine/db/index.js';
import { describe, test } from 'xxscreeps/test/context.js';
import { instantiateTestShard } from 'xxscreeps/test/import.js';

describe('Shard time race condition', () => {
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

	test('runner: loadRoomBlob succeeds when shard.time advances 2+ ticks', async () => {
		const { db, shard: mainShard } = await instantiateTestShard();

		const runnerShard = await Shard.connectWith(db, {
			name: 'shard0',
			data: 'local://keyval',
			pubsub: 'local://pubsub',
			scratch: 'local://scratch',
		});

		// Runner freezes time at the start of tick processing (as the fix does)
		runnerShard.freezeTime();

		// Simulate main completing 2 ticks while runner is busy processing.
		// This happens when the runner processes many players sequentially
		// and the processor completes ticks faster than the runner can keep up.
		await mainShard.data.set('time', 3);
		await mainShard.channel.publish({ type: 'tick', time: 2 });
		await mainShard.channel.publish({ type: 'tick', time: 3 });

		// Runner's time is frozen — pubsub updates are buffered
		assert.equal(runnerShard.time, 1);

		// Runner is still processing run(2) and tries to load room blob for time 1.
		// With frozen time, checkTime validates against the stable shard.time (1).
		const blob = await runnerShard.loadRoomBlob('W1N1', 1);
		assert.ok(blob);

		// After processing, runner unfreezes and catches up
		runnerShard.unfreezeTime();
		assert.equal(runnerShard.time, 3);

		runnerShard.disconnect();
		mainShard.disconnect();
		db.disconnect();
	});
});
