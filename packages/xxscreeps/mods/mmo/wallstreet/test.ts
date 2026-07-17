import type { Shard } from 'xxscreeps/engine/db/index.js';
import * as User from 'xxscreeps/engine/db/user/index.js';
import { Fn } from 'xxscreeps/functional/fn.js';
import * as C from 'xxscreeps/game/constants/index.js';
import { RoomPosition } from 'xxscreeps/game/position.js';
import { Market } from 'xxscreeps/mods/classic/brokerage/market.js';
import { create as createTerminal } from 'xxscreeps/mods/classic/brokerage/terminal.js';
import { DeterministicClockForTesting } from 'xxscreeps/test/fixtures.js';
import { assert, describe, simulate, test } from 'xxscreeps/test/index.js';
import { incrementUserCredits, loadAndReadMarketOrder, loadMarketOrderIds, loadUserCredits, marketChannel } from './model.js';

async function loadMarketOrderBookForTesting(shard: Shard) {
	const ids = await loadMarketOrderIds(shard);
	return Fn.mapAwait(ids, id => loadAndReadMarketOrder(shard, id));
}

describe('mod/mmo/wallstreet', () => {

	// Player has 50k credits and controls a terminal in W1N1 with 10k energy
	const makeMarketSim = (userId: string) => simulate({
		W1N1: room => {
			const terminal = createTerminal(new RoomPosition(25, 25, 'W1N1'), userId);
			terminal.store['#add'](C.RESOURCE_ENERGY, 10000);
			room['#insertObject'](terminal);
			room['#level'] = 8;
			room['#user'] = room.controller!['#user'] = userId;
		},
	}, async shard => {
		await incrementUserCredits(shard, userId, 50_000);
	});

	// User '100' owns a terminal in W1N1 holding energy stock.
	const sim = makeMarketSim('100');

	const options = { resourceType: C.RESOURCE_ENERGY, price: 0.5, roomName: 'W1N1' } as const;
	// fee = 2,500
	const buyOptions = { ...options, totalAmount: 100, type: C.ORDER_BUY } as const;
	// fee = 25,000
	const sellOptions = { ...options, totalAmount: 1000, type: C.ORDER_SELL } as const;

	test('createOrder charges the fee and anchors the order; the room pass activates it', () => sim(async ({ player, shard, tick }) => {
		await shard.db.data.hincrBy(User.infoKey('100'), 'money', 50_000);
		await player('100', Game => {
			const market = new Market(Game, undefined);
			assert.strictEqual(market.createOrder(sellOptions), C.OK);
		});
		await tick();

		// The terminal intent wrote the order inactive.
		const [ order ] = await loadMarketOrderBookForTesting(shard);
		assert.ok(order);
		assert.strictEqual(order.type, C.ORDER_SELL);
		assert.strictEqual(order['#price'], 500);
		assert.strictEqual(order.totalAmount, 1000);
		assert.strictEqual(order.remainingAmount, 1000);
		assert.strictEqual(order.amount, 0);
		assert.strictEqual(order.active, false);
		assert.strictEqual(order.roomName, 'W1N1');
		assert.strictEqual(order['#user'], '100');
		assert.strictEqual(await loadUserCredits(shard, '100'), 25_000);
		const { terminal } = await shard.loadRoom('W1N1');
		assert.deepStrictEqual([ ...Fn.map(terminal!['#orders'], order => order.id) ], [ order.id ]);

		// The next room pass activates it against terminal stock: min(10_000 stocked, 1000 remaining).
		await tick();
		const [ activated ] = await loadMarketOrderBookForTesting(shard);
		assert.strictEqual(activated?.active, true);
		assert.strictEqual(activated.amount, 1000);
		assert.deepStrictEqual(await loadMarketOrderIds(shard), [ order.id ]);
	}));

	test('two same-tick orders on one terminal both materialize', () => sim(async ({ player, shard, tick }) => {
		await player('100', Game => {
			const market = new Market(Game, undefined);
			assert.strictEqual(market.createOrder(sellOptions), C.OK);
			assert.strictEqual(market.createOrder(buyOptions), C.OK);
		});
		await tick();

		const orders = await loadMarketOrderBookForTesting(shard);
		assert.strictEqual(orders.length, 2);
		assert.strictEqual(await loadUserCredits(shard, '100'), 22_500);
		const { terminal } = await shard.loadRoom('W1N1');
		assert.strictEqual(terminal?.['#orders'].length, 2);
	}));

	test('a buy order tracks credits bounded by free space, patching the amount in place', () => sim(async ({ player, shard, tick }) => {
		await player('100', Game => {
			const market = new Market(Game, undefined);
			assert.strictEqual(market.createOrder(buyOptions), C.OK);
		});
		// Create, then activate: fee = 2,500; credits = 47,500
		await tick(2);
		const [ order1 ] = await loadMarketOrderBookForTesting(shard);
		assert.strictEqual(order1?.active, true);
		assert.strictEqual(order1.amount, 95);

		// Down to 20,000 credits
		await incrementUserCredits(shard, '100', -27_500);
		await tick();
		const [ order ] = await loadMarketOrderBookForTesting(shard);
		assert.strictEqual(order?.active, true);
		assert.strictEqual(order.amount, 40);
	}));

	test('the room pass rewrites only orders whose state changed', () => sim(async ({ player, shard, tick }) => {
		await player('100', Game => {
			const market = new Market(Game, undefined);
			assert.strictEqual(market.createOrder(sellOptions), C.OK);
		});
		await tick();
		const check = await async function() {
			using channel = await marketChannel(shard).subscribe();
			const messages = channel.iterable();
			await tick(2);
			return () => Array.fromAsync(messages);
		}();
		const messages = await check();
		assert.strictEqual(messages.length, 1);
	}));

	test('an aged order expires with the unspent fee refunded', () => sim(async ({ player, shard, tick }) => {
		using clock = new DeterministicClockForTesting();
		await player('100', Game => {
			const market = new Market(Game, undefined);
			assert.strictEqual(market.createOrder(sellOptions), C.OK);
		});
		await tick(2);
		clock.increment(C.MARKET_ORDER_LIFE_TIME + 1);
		await tick();
		assert.deepStrictEqual(await loadMarketOrderBookForTesting(shard), []);
		assert.deepStrictEqual(await loadMarketOrderIds(shard), []);
		assert.strictEqual(await loadUserCredits(shard, '100'), 50_000);
		await tick();
		const { terminal } = await shard.loadRoom('W1N1');
		assert.strictEqual(terminal?.['#orders'].length, 0);
	}));

	test('an orphaned order is dropped by the room pass', () => sim(async ({ player, shard, tick }) => {
		await player('100', Game => {
			const market = new Market(Game, undefined);
			assert.strictEqual(market.createOrder(sellOptions), C.OK);
		});
		await tick(2);
		const [ order ] = await loadMarketOrderBookForTesting(shard);
		assert.ok(order);
		// Delete the underlying order blob
		await shard.data.del(`market/order/${order.id}`);

		// The version probe drops the order and its index entries instead of throwing. No refund is
		// issued.
		await tick();
		assert.deepStrictEqual(await loadMarketOrderBookForTesting(shard), []);
		assert.deepStrictEqual(await loadMarketOrderIds(shard), []);
		const { terminal } = await shard.loadRoom('W1N1');
		assert.strictEqual(terminal!['#orders'].length, 0);
	}));

	test('incrementUserCredits refuses an overdraft', () => sim(async ({ shard }) => {
		assert.strictEqual(await incrementUserCredits(shard, '100', -50_001), false);
		assert.strictEqual(await loadUserCredits(shard, '100'), 50_000);
		assert.strictEqual(await incrementUserCredits(shard, '100', -50_000), true);
		assert.strictEqual(await loadUserCredits(shard, '100'), 0);
	}));

	test('createOrder rejects a user who owns no terminal in the room', () => sim(async ({ player, shard }) => {
		await player('101', Game => {
			const market = new Market(Game, undefined);
			assert.strictEqual(market.createOrder(sellOptions), C.ERR_NOT_OWNER);
		});
		assert.deepStrictEqual(await loadMarketOrderBookForTesting(shard), []);
	}));

	test('createOrder truncates a fractional or negative totalAmount', () => sim(async ({ player }) => {
		await player('100', Game => {
			const market = new Market(Game, undefined);
			// Under one unit truncates to zero.
			assert.strictEqual(market.createOrder({ ...sellOptions, totalAmount: 0.5 }), C.ERR_INVALID_ARGS);
			assert.strictEqual(market.createOrder({ ...sellOptions, totalAmount: 1.5 }), C.OK);
			assert.strictEqual(market.createOrder({ ...sellOptions, totalAmount: -5 }), C.ERR_INVALID_ARGS);
		});
	}));

	test('createOrder reaches the book; the connector ships the active book and your orders', async () => {
		const sim = makeMarketSim('200');
		await sim(async ({ sandbox, shard, tick }) => {
			await using player = await sandbox('200', global => {
				const market = global.Game.market;
				if (global.Game.time === 1) {
					assert.strictEqual(market.createOrder({
						type: 'sell', resourceType: 'energy', price: 0.5, totalAmount: 1000, roomName: 'W1N1',
					}), 0);
				}
			});
			// Create (tick 1), read while still inactive (tick 2), read after activation (tick 3).
			await tick(3);

			const [ order ] = await loadMarketOrderBookForTesting(shard);
			assert.ok(order);
			assert.strictEqual(order['#user'], '200');
			assert.strictEqual(order['#price'], 500);
			assert.strictEqual(order.active, true);
			assert.strictEqual(await loadUserCredits(shard, '200'), 25_000);
		});
	});
});
