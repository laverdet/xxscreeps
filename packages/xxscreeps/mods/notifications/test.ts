import * as C from 'xxscreeps/game/constants/index.js';
import { assert, describe, simulate, test } from 'xxscreeps/test/index.js';
import { dispatchQueuedNotifications } from './driver.js';
import { getNotifications } from './model.js';
import { flush } from './notifications.js';

const user = '100';

const empty = simulate({
	W0N0: () => {},
});

// Disposable clock override. Patches `Date.now` for the lifetime of the binding so callers can
// `using _ = withFrozenTime(now)` and have it restored on scope exit. Tests in a single describe
// block run serially; concurrent uses would clobber each other's restore.
function withFrozenTime(now: number): Disposable {
	const original = Date.now;
	Date.now = () => now;
	return { [Symbol.dispose]() { Date.now = original; } };
}

describe('Game.notify', () => {

	test('returns OK on accept', () => empty(async ({ player }) => {
		await player(user, Game => {
			assert.strictEqual(Game.notify('hi'), C.OK);
		});
	}));

	test('21st call in a tick returns ERR_FULL', () => empty(async ({ player }) => {
		await player(user, Game => {
			for (let ii = 0; ii < 20; ++ii) {
				assert.strictEqual(Game.notify(`msg${ii}`), C.OK,
					`call #${ii + 1} should accept`);
			}
			assert.strictEqual(Game.notify('overflow'), C.ERR_FULL,
				'21st call should be capped');
		});
	}));

	test('cap resets across ticks', () => empty(async ({ player, tick }) => {
		await player(user, Game => {
			for (let ii = 0; ii < 20; ++ii) {
				assert.strictEqual(Game.notify(`a${ii}`), C.OK);
			}
		});
		await tick();
		await player(user, Game => {
			for (let ii = 0; ii < 20; ++ii) {
				assert.strictEqual(Game.notify(`b${ii}`), C.OK,
					`tick N+1 call #${ii + 1} should accept`);
			}
		});
	}));

	test('notify intent lands a documented row', () => empty(async ({ player, shard }) => {
		await player(user, Game => {
			Game.notify('hi');
		});
		await dispatchQueuedNotifications(shard, user, flush());
		const rows = await getNotifications(shard, user);
		assert.strictEqual(rows.length, 1);
		const row = rows[0];
		assert.strictEqual(row.user, user);
		assert.strictEqual(row.message, 'hi');
		assert.strictEqual(typeof row.date, 'number');
		assert.strictEqual(row.count, 1);
		assert.strictEqual(row.type, 'msg');
	}));

	test('groupInterval=1 coalesces same-message calls in the bucket window', () => empty(async ({ player, shard }) => {
		using _frozen = withFrozenTime(1_000_000);
		await player(user, Game => {
			Game.notify('hi', 1);
			Game.notify('hi', 1);
		});
		await dispatchQueuedNotifications(shard, user, flush());
		const rows = await getNotifications(shard, user);
		assert.strictEqual(rows.length, 1, 'same-bucket calls collapse to one row');
		assert.strictEqual(rows[0].message, 'hi');
		assert.strictEqual(rows[0].count, 2);
		// Stored `date` is the actual write time, not the bucket boundary.
		assert.strictEqual(rows[0].date, 1_000_000);
	}));

	test('600-char message stored as 500 chars', () => empty(async ({ player, shard }) => {
		await player(user, Game => {
			Game.notify('a'.repeat(600));
		});
		await dispatchQueuedNotifications(shard, user, flush());
		const rows = await getNotifications(shard, user);
		assert.strictEqual(rows.length, 1);
		assert.strictEqual(rows[0].message.length, 500);
		assert.strictEqual(rows[0].message, 'a'.repeat(500));
	}));

	test('groupInterval clamp ([0, 1440]) reflected in bucket placement', () => empty(async ({ player, shard }) => {
		using _frozen = withFrozenTime(1_000_000);
		await player(user, Game => {
			Game.notify('low', -5);
			Game.notify('high', 5000);
		});
		await dispatchQueuedNotifications(shard, user, flush());
		const rows = await getNotifications(shard, user);
		// Two distinct row ids: low → groupInterval clamps to 0 (bucket = now); high → clamps to
		// 1440 (bucket = ceil(now/86_400_000) * 86_400_000). Different timeGroup → different hash.
		assert.strictEqual(rows.length, 2);
		const messages = rows.map(row => row.message).sort();
		assert.deepStrictEqual(messages, [ 'high', 'low' ]);
		// Both rows record actual write time as `date`, regardless of bucket.
		for (const row of rows) {
			assert.strictEqual(row.date, 1_000_000);
		}
	}));

	test('message coercion via `${i.message}`', () => empty(async ({ player, shard }) => {
		await player(user, Game => {
			Game.notify(null as unknown as string);
			Game.notify({ a: 1 } as unknown as string);
		});
		await dispatchQueuedNotifications(shard, user, flush());
		const rows = await getNotifications(shard, user);
		assert.strictEqual(rows.length, 2);
		const messages = rows.map(row => row.message).sort();
		assert.deepStrictEqual(messages, [ '[object Object]', 'null' ]);
	}));

	test('no-args Game.notify() stores "undefined" with current-date', () => empty(async ({ player, shard }) => {
		using _frozen = withFrozenTime(1_234_567);
		await player(user, Game => {
			assert.strictEqual((Game.notify as unknown as () => number)(), C.OK);
		});
		await dispatchQueuedNotifications(shard, user, flush());
		const rows = await getNotifications(shard, user);
		assert.strictEqual(rows.length, 1);
		assert.strictEqual(rows[0].message, 'undefined');
		assert.strictEqual(rows[0].date, 1_234_567);
		assert.strictEqual(rows[0].count, 1);
		assert.strictEqual(rows[0].type, 'msg');
	}));

	test('non-numeric groupInterval falls through to current-date', () => empty(async ({ player, shard }) => {
		using _frozen = withFrozenTime(1_234_567);
		await player(user, Game => {
			Game.notify('strInterval', 'abc' as unknown as number);
			Game.notify('nanInterval', NaN);
		});
		await dispatchQueuedNotifications(shard, user, flush());
		const rows = await getNotifications(shard, user);
		assert.strictEqual(rows.length, 2);
		for (const row of rows) {
			assert.strictEqual(row.date, 1_234_567,
				`${row.message} should bypass bucket math and land at Date.now()`);
		}
	}));

});
