import * as C from 'xxscreeps/game/constants/index.js';
import { assert, describe, simulate, test } from 'xxscreeps/test/index.js';
import { getNotifications } from './model.js';

const user = '100';

const empty = simulate({
	W0N0: () => {},
});

// Manual clock control. xxscreeps' test runner has no fake-timer integration, so we patch
// `Date.now` globally for the duration of the closure. Safe only because vitest runs tests within
// a describe serially; two parallel callers would clobber each other's restore.
async function withFrozenTime<Type>(now: number, fn: () => Promise<Type>) {
	const original = Date.now;
	Date.now = () => now;
	try {
		return await fn();
	} finally {
		Date.now = original;
	}
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

	test('notify intent lands a documented row', () => empty(async ({ player, tick, shard }) => {
		await player(user, Game => {
			Game.notify('hi');
		});
		await tick();
		const rows = await getNotifications(shard, user);
		assert.strictEqual(rows.length, 1);
		const row = rows[0];
		assert.strictEqual(row.user, user);
		assert.strictEqual(row.message, 'hi');
		assert.strictEqual(typeof row.date, 'number');
		assert.strictEqual(row.count, 1);
		assert.strictEqual(row.type, 'msg');
	}));

	test('groupInterval=1 coalesces same-message calls in the bucket window', () => empty(async ({ player, tick, shard }) => {
		const frozen = 1_000_000;
		await withFrozenTime(frozen, async () => {
			await player(user, Game => {
				Game.notify('hi', 1);
				Game.notify('hi', 1);
			});
			await tick();
			const rows = await getNotifications(shard, user);
			assert.strictEqual(rows.length, 1, 'same-bucket calls collapse to one row');
			assert.strictEqual(rows[0].message, 'hi');
			assert.strictEqual(rows[0].count, 2);
			// ceil(1_000_000 / 60_000) * 60_000
			assert.strictEqual(rows[0].date, 1_020_000, 'bucket-date is the next minute boundary');
		});
	}));

	test('600-char message stored as 500 chars', () => empty(async ({ player, tick, shard }) => {
		await player(user, Game => {
			Game.notify('a'.repeat(600));
		});
		await tick();
		const rows = await getNotifications(shard, user);
		assert.strictEqual(rows.length, 1);
		assert.strictEqual(rows[0].message.length, 500);
		assert.strictEqual(rows[0].message, 'a'.repeat(500));
	}));

	test('groupInterval clamp ([0, 1440]) reflected in bucket placement', () => empty(async ({ player, tick, shard }) => {
		const frozen = 1_000_000;
		await withFrozenTime(frozen, async () => {
			await player(user, Game => {
				Game.notify('low', -5);
				Game.notify('high', 5000);
			});
			await tick();
			const rows = await getNotifications(shard, user);
			assert.strictEqual(rows.length, 2);
			const low = rows.find(row => row.message === 'low');
			const high = rows.find(row => row.message === 'high');
			assert.ok(low, 'low-clamp row exists');
			assert.ok(high, 'high-clamp row exists');
			// -5 → clamped to 0 → no bucket math → date = Date.now()
			assert.strictEqual(low.date, frozen);
			// 5000 → clamped to 1440 → intervalMs = 86_400_000 → ceil(1_000_000 / 86_400_000) * 86_400_000
			assert.strictEqual(high.date, 86_400_000);
		});
	}));

	test('message coercion via "" + i.message', () => empty(async ({ player, tick, shard }) => {
		await player(user, Game => {
			Game.notify(null as unknown as string);
			Game.notify({ a: 1 } as unknown as string);
		});
		await tick();
		const rows = await getNotifications(shard, user);
		assert.strictEqual(rows.length, 2);
		const messages = rows.map(row => row.message).sort();
		assert.deepStrictEqual(messages, [ '[object Object]', 'null' ]);
	}));

	test('no-args Game.notify() stores "undefined" with current-date', () => empty(async ({ player, tick, shard }) => {
		const frozen = 1_234_567;
		await withFrozenTime(frozen, async () => {
			await player(user, Game => {
				assert.strictEqual((Game.notify as unknown as () => number)(), C.OK);
			});
			await tick();
			const rows = await getNotifications(shard, user);
			assert.strictEqual(rows.length, 1);
			assert.strictEqual(rows[0].message, 'undefined');
			assert.strictEqual(rows[0].date, frozen);
			assert.strictEqual(rows[0].count, 1);
			assert.strictEqual(rows[0].type, 'msg');
		});
	}));

	test('non-numeric groupInterval falls through to current-date', () => empty(async ({ player, tick, shard }) => {
		const frozen = 1_234_567;
		await withFrozenTime(frozen, async () => {
			await player(user, Game => {
				Game.notify('strInterval', 'abc' as unknown as number);
				Game.notify('nanInterval', NaN);
			});
			await tick();
			const rows = await getNotifications(shard, user);
			assert.strictEqual(rows.length, 2);
			for (const row of rows) {
				assert.strictEqual(row.date, frozen,
					`${row.message} should bypass bucket math and land at Date.now()`);
			}
		});
	}));

});
