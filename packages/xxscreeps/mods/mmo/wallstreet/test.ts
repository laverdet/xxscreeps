import { Shard } from 'xxscreeps/engine/db/index.js';
import * as Id from 'xxscreeps/engine/schema/id.js';
import { Fn } from 'xxscreeps/functional/fn.js';
import * as C from 'xxscreeps/game/constants/index.js';
import { RoomPosition } from 'xxscreeps/game/position.js';
import { create as createTerminal } from 'xxscreeps/mods/classic/brokerage/terminal.js';
import { DeterministicClockForTesting } from 'xxscreeps/test/fixtures.js';
import { assert, describe, simulate, test } from 'xxscreeps/test/index.js';
import { instantiate } from 'xxscreeps/utility/utility.js';
import { incrementUserCredits, insertOrder, loadAndReadMarketOrder, loadMarketOrderIds, loadUserCredits, marketChannel, updateOrderAmount } from './model.js';
import { Order } from './order.js';

async function loadMarketOrderBookForTesting(shard: Shard) {
	const ids = await loadMarketOrderIds(shard);
	return Fn.mapAwait(ids, id => loadAndReadMarketOrder(shard, id));
}

describe('mods/mmo/wallstreet', () => {

	// Player has 50k millicredits and controls a terminal in W1N1 with 10k energy
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

	test('read getters split the active book from your own orders', async () => sim(async ({ player, shard, tick }) => {
		await incrementUserCredits(shard, '101', 50_000);
		await tick();

		// Both players issue orders
		await player('100', Game => {
			assert.strictEqual(Game.market.createOrder(sellOptions), C.OK);
		});
		// nb: Orphaned active order for 101
		{
			const order = instantiate(Order, {
				id: Id.generateId(),
				amount: 0,
				created: 1,
				createdTimestamp: Date.now(),
				remainingAmount: 1000,
				resourceType: C.RESOURCE_ENERGY,
				roomName: 'W2N1',
				totalAmount: 1000,
			});
			order['#buy'] = false;
			order['#user'] = '101';
			order['#price'] = 0.5;
			await Promise.all([
				insertOrder(shard, order),
				updateOrderAmount(shard, order.id, 1000),
			]);
		}

		// getAllOrders exposes the active book only
		await tick();
		await player('100', Game => {
			assert.strictEqual(Game.market.getAllOrders().length, 1);
			assert.strictEqual(Object.keys(Game.market.orders).length, 1);
			const order = Object.values(Game.market.orders)[0];
			assert.strictEqual(order?.price, 0.5);
			assert.strictEqual(order.active, false);
		});

		// Now the orders are active
		await tick();
		await player('100', Game => {
			assert.strictEqual(Game.market.getAllOrders().length, 2);
			const order = Object.values(Game.market.orders)[0];
			assert.strictEqual(order?.price, 0.5);
			assert.strictEqual(order.active, true);
			// Object filter matches every specified key; a function filter is also accepted.
			const energy = Game.market.getAllOrders({ resourceType: C.RESOURCE_ENERGY });
			assert.strictEqual(energy.length, 2);
			assert.strictEqual(Game.market.getAllOrders((order: Order) => order.type === C.ORDER_SELL).length, 2);
		});
	}));

	test('order blobs persist across delta payloads and drop with membership', () => sim(async ({ player, tick }) => {
		using clock = new DeterministicClockForTesting();
		await player('100', Game => {
			assert.strictEqual(Game.market.createOrder(sellOptions), C.OK);
			assert.strictEqual(Game.market.createOrder(sellOptions), C.OK);
		});
		await tick();
		let ids: string[];
		await player('100', Game => {
			ids = Object.keys(Game.market.orders);
			assert.strictEqual(ids.length, 2);
			assert.strictEqual(Object.keys(Game.market.orders).length, 2);
		});
		clock.increment(C.MARKET_ORDER_LIFE_TIME + 1);
		await tick();
		await player('100', Game => {
			assert.strictEqual(Game.market.getOrderById(ids[0]!), null);
			assert.strictEqual(Game.market.getAllOrders().length, 0);
			assert.strictEqual(Object.keys(Game.market.orders).length, 0);
		});
		// TODO: A changed blob overrides the retained one.
	}));

	test('createOrder charges the fee and anchors the order; the room pass activates it', () => sim(async ({ player, shard, tick }) => {
		await player('100', Game => {
			assert.strictEqual(Game.market.createOrder(sellOptions), C.OK);
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
			assert.strictEqual(Game.market.createOrder(sellOptions), C.OK);
			assert.strictEqual(Game.market.createOrder(buyOptions), C.OK);
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
			assert.strictEqual(Game.market.createOrder(buyOptions), C.OK);
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
			assert.strictEqual(Game.market.createOrder(sellOptions), C.OK);
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
			assert.strictEqual(Game.market.createOrder(sellOptions), C.OK);
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
			assert.strictEqual(Game.market.createOrder(sellOptions), C.OK);
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

	test('createOrder rejects when the fee exceeds available credits', () => sim(async ({ player }) => {
		await player('100', Game => {
			assert.strictEqual(Game.market.createOrder({ ...sellOptions, price: 1 }), C.OK);
			assert.strictEqual(Game.market.createOrder({ ...sellOptions, price: 1.01 }), C.ERR_NOT_ENOUGH_RESOURCES);
		});
	}));

	test('createOrder rejects a user who owns no terminal in the room', () => sim(async ({ player, shard }) => {
		await player('101', Game => {
			assert.strictEqual(Game.market.createOrder(sellOptions), C.ERR_NOT_OWNER);
		});
		assert.deepStrictEqual(await loadMarketOrderBookForTesting(shard), []);
	}));

	test('a second same-tick createOrder at the cap returns ERR_FULL', () => sim(async ({ player }) => {
		await player('100', Game => {
			// One slot under the cap: the first call fits, the second counts the first's pending order.
			for (const ii of Fn.range(C.MARKET_MAX_ORDERS - 1)) {
				assert.strictEqual(Game.market.createOrder({ ...sellOptions, totalAmount: 1, price: ii + 1 }), C.OK);
			}
			assert.strictEqual(Game.market.createOrder(sellOptions), C.OK);
			assert.strictEqual(Game.market.createOrder(sellOptions), C.ERR_FULL);
		});
	}));

	test('createOrder truncates a fractional or negative totalAmount', () => sim(async ({ player }) => {
		await player('100', Game => {
			// Under one unit truncates to zero.
			assert.strictEqual(Game.market.createOrder({ ...sellOptions, totalAmount: 0.5 }), C.ERR_INVALID_ARGS);
			assert.strictEqual(Game.market.createOrder({ ...sellOptions, totalAmount: 1.5 }), C.OK);
			assert.strictEqual(Game.market.createOrder({ ...sellOptions, totalAmount: -5 }), C.ERR_INVALID_ARGS);
		});
	}));

	test('createOrder reaches the book; the connector ships the active book and your orders', async () => {
		const sim = makeMarketSim('200');
		await sim(async ({ sandbox, shard, tick }) => {
			await using player = await sandbox('200', global => {
				const market = global.Game.market;
				switch (global.Game.time) {
					case 0:
						assert.strictEqual(market.createOrder({
							type: 'sell', resourceType: 'energy', price: 0.5, totalAmount: 1000, roomName: 'W1N1',
						}), 0);
						break;

					case 1:
					case 2: {
						// Later ticks: the connector shipped credits, your one order, and the active public
						// book. The book is active-only, so your order is in it exactly when it is active.
						const ids = Object.keys(market.orders);
						assert.strictEqual(ids.length, 1);
						assert.strictEqual(market.credits, 25);
						const id = ids[0]!;
						assert.strictEqual(market.getOrderById(id)?.price, 0.5);
						const all = market.getAllOrders();
						for (const order of all) {
							assert.strictEqual(order.active, global.Game.time !== 1);
						}
					}
				}
			});
				// Create (tick 0), read while still inactive (tick 1), read after activation (tick 2).
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
