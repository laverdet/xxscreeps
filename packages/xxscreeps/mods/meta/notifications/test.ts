import { assert, describe, simulate, test } from 'xxscreeps/test/index.js';
import * as C from 'xxscreeps:mods/constants';
import { dispatchQueuedNotifications } from './driver.js';
import { flush } from './notifications.js';
import { setNotifyPrefs } from './prefs.js';
import { captureNotificationsForTesting, sendNotification } from './transport.js';

const userA = '100';

const empty = simulate({
	W0N0: () => {},
});

describe('mods/meta/notifications', () => {

	// The notify queue is module-level state that persists between tests (the test framework runs
	// sequentially in one process and `simulate.tick()` does not fire runtimeConnector.send to drain
	// it, the way prod does). Each test which queues calls `flush()` first to start with a clean
	// queue, mirroring the visual mod's "calls clear() to avoid shared state" pattern.

	test('returns OK on accept', () => empty(async ({ player }) => {
		flush();
		await player(userA, Game => {
			assert.strictEqual(Game.notify('hi'), C.OK);
		});
	}));

	test('21st call in a tick returns ERR_FULL', () => empty(async ({ player }) => {
		flush();
		await player(userA, Game => {
			for (let ii = 0; ii < 20; ++ii) {
				assert.strictEqual(Game.notify(`msg${ii}`), C.OK,
					`call #${ii + 1} should accept`);
			}
			assert.strictEqual(Game.notify('overflow'), C.ERR_FULL,
				'21st call should be capped');
		});
	}));

	test('cap resets across ticks', () => empty(async ({ player, tick }) => {
		flush();
		await player(userA, Game => {
			for (let ii = 0; ii < 20; ++ii) {
				assert.strictEqual(Game.notify(`a${ii}`), C.OK);
			}
		});
		// Simulate runtimeConnector.send draining at tick boundary (simulate.tick() doesn't).
		flush();
		await tick();
		await player(userA, Game => {
			for (let ii = 0; ii < 20; ++ii) {
				assert.strictEqual(Game.notify(`b${ii}`), C.OK,
					`tick N+1 call #${ii + 1} should accept`);
			}
		});
	}));

	test('intent reaches the transport', () => empty(async ({ player, shard }) => {
		flush();
		using capture = captureNotificationsForTesting();
		await player(userA, Game => {
			Game.notify('hi');
		});
		await dispatchQueuedNotifications(shard, userA, flush());
		assert.strictEqual(capture.sent.length, 1);
		const [ entry ] = capture.sent;
		assert.strictEqual(entry?.userId, userA);
		assert.strictEqual(entry.message, 'hi');
		assert.strictEqual(entry.type, 'msg');
		assert.strictEqual(entry.groupInterval, 0);
	}));

	test('message truncated to 500 chars', () => empty(async ({ player, shard }) => {
		flush();
		using capture = captureNotificationsForTesting();
		await player(userA, Game => {
			Game.notify('a'.repeat(600));
		});
		await dispatchQueuedNotifications(shard, userA, flush());
		assert.strictEqual(capture.sent.length, 1);
		assert.strictEqual(capture.sent[0]?.message, 'a'.repeat(500));
	}));

	test('groupInterval clamps to [0, 1440]', () => empty(async ({ player, shard }) => {
		flush();
		using capture = captureNotificationsForTesting();
		await player(userA, Game => {
			Game.notify('low', -5);
			Game.notify('high', 5000);
		});
		await dispatchQueuedNotifications(shard, userA, flush());
		const intervals = new Map(capture.sent.map(entry => [ entry.message, entry.groupInterval ]));
		assert.strictEqual(intervals.get('low'), 0);
		assert.strictEqual(intervals.get('high'), 1440);
	}));

	test('non-numeric groupInterval coerces to 0', () => empty(async ({ player, shard }) => {
		flush();
		using capture = captureNotificationsForTesting();
		await player(userA, Game => {
			Game.notify('strInterval', 'abc' as unknown as number);
			Game.notify('nanInterval', NaN);
			Game.notify('infInterval', Infinity);
		});
		await dispatchQueuedNotifications(shard, userA, flush());
		assert.strictEqual(capture.sent.length, 3);
		for (const entry of capture.sent) {
			assert.strictEqual(entry.groupInterval, 0,
				`${entry.message} should coerce to no grouping`);
		}
	}));

	test('message coercion', () => empty(async ({ player, shard }) => {
		flush();
		using capture = captureNotificationsForTesting();
		await player(userA, Game => {
			Game.notify(null as unknown as string);
			Game.notify({ a: 1 } as unknown as string);
		});
		await dispatchQueuedNotifications(shard, userA, flush());
		const messages = capture.sent.map(entry => entry.message).sort();
		assert.deepStrictEqual(messages, [ '[object Object]', 'null' ]);
	}));

	test('no-args call sends "undefined"', () => empty(async ({ player, shard }) => {
		flush();
		using capture = captureNotificationsForTesting();
		await player(userA, Game => {
			assert.strictEqual((Game.notify as unknown as () => number)(), C.OK);
		});
		await dispatchQueuedNotifications(shard, userA, flush());
		assert.strictEqual(capture.sent.length, 1);
		assert.strictEqual(capture.sent[0]?.message, 'undefined');
		assert.strictEqual(capture.sent[0].type, 'msg');
	}));

	test('notifyPrefs.disabled drops before the transport', () => empty(async ({ shard }) => {
		using capture = captureNotificationsForTesting();
		await setNotifyPrefs(shard.db, userA, { disabled: true });
		await sendNotification(shard, userA, 'msg', 'hi');
		assert.strictEqual(capture.sent.length, 0, 'disabled user reaches no transport');
		await setNotifyPrefs(shard.db, userA, { disabled: false });
		await sendNotification(shard, userA, 'msg', 'hi');
		assert.strictEqual(capture.sent.length, 1, 'the same call lands once the pref clears');
	}));

});
