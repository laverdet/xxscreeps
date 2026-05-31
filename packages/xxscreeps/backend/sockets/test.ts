import type { Effect } from 'xxscreeps/utility/types.js';
import { Channel } from 'xxscreeps/engine/db/channel.js';
import { instantiateTestShard } from 'xxscreeps/test/import.js';
import { assert, describe, test } from 'xxscreeps/test/index.js';
import { subscribeToRoom } from './room.js';

describe('Backend', () => {
	describe('subscribeToRoom', () => {

		// Regression: the publisher loaded a blob for tick T but rendered it at a later `Game.time`
		// because the tick channel advances `time` during `await loadRoom`, reading decay fields as
		// overdue (`Invalid expiry time`). A blob must be rendered at the tick it was loaded for.
		test('renders a room at the tick its blob was loaded for, even when a tick arrives mid-load',
			async () => {
				using testShard = await instantiateTestShard();
				const { shard } = testShard;
				const roomName = 'W1N1';
				// Publish ticks from a fresh channel; `shard.channel` would self-exclude its own listener.
				const game = new Channel<{ type: 'tick'; time: number }>(shard.pubsub, 'channel/game');

				// Record every (time, didUpdate) the subscription publishes; resolve once the staged
				// update (the second `didUpdate` render) has been published.
				const calls: { time: number; didUpdate: boolean }[] = [];
				const rendered: PromiseWithResolvers<void> = Promise.withResolvers();
				// `subscribeToRoom` is typed `any` upstream (recursive resubscribe path); it returns an unlisten effect.
				const unsubscribe = await subscribeToRoom(shard, roomName, (_room, time, didUpdate) => {
					calls.push({ time, didUpdate });
					if (calls.filter(call => call.didUpdate).length >= 2) {
						rendered.resolve();
					}
				}) as Effect;

				// Stage a room update for tick 1 so the next publish carries `didUpdate`.
				const room = await shard.loadRoom(roomName, 0);
				await shard.saveRoom(roomName, 1, room);

				// Inject a tick that lands *during* the throttle's `await loadRoom`, advancing the
				// subscription's internal `time` from 1 to 2 before it publishes.
				let injected = false;
				const loadRoom = shard.loadRoom.bind(shard);
				shard.loadRoom = async (name: string, time?: number, skipInitialization?: boolean) => {
					if (!injected) {
						injected = true;
						await game.publish({ type: 'tick', time: 2 });
					}
					return loadRoom(name, time, skipInitialization);
				};

				// Advance to tick 1 and fire the throttle, then wait for the resulting publish.
				await game.publish({ type: 'tick', time: 1 });
				await rendered.promise;
				unsubscribe();

				// The last `didUpdate` render must be at the tick whose blob it holds (1), not the
				// advanced tick (2).
				const renders = calls.filter(call => call.didUpdate);
				assert.strictEqual(renders.at(-1)?.time, 1,
					`expected render at the loaded tick 1, got ${renders.at(-1)?.time} (blob/render-time seam)`);
			});
	});
});
