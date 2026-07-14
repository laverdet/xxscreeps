import type { Shard } from 'xxscreeps/engine/db/index.js';
import type { GameBase } from 'xxscreeps/game/game.js';
import * as User from 'xxscreeps/engine/db/user/index.js';
import { Fn } from 'xxscreeps/functional/fn.js';
import * as C from 'xxscreeps/game/constants/index.js';
import { RoomPosition } from 'xxscreeps/game/position.js';
import { lookForStructures } from 'xxscreeps/mods/classic/structure/structure.js';
import { DeterministicClockForTesting } from 'xxscreeps/test/fixtures.js';
import { assert, describe, simulate, test } from 'xxscreeps/test/index.js';
import { Market } from './market.js';
import { incrementUserCredits, loadAndReadMarketOrder, loadMarketOrderIds, loadTransactionBlob, loadTransactionEntries, loadUserCredits, marketChannel, recordTransaction } from './model.js';
import { create as createTerminal } from './terminal.js';
import { Transactions, read } from './transaction.js';

async function loadMarketOrderBookForTesting(shard: Shard) {
	const ids = await loadMarketOrderIds(shard);
	return Fn.mapAwait(ids, id => loadAndReadMarketOrder(shard, id));
}

describe('mod/market', () => {
	describe('transactions', () => {

		// Storage only — `recordTransaction` doesn't touch rooms, and users '100'/'101' exist by default.
		const storageSim = simulate({});
		const fields = {
			time: 10, resourceType: C.RESOURCE_ENERGY, amount: 1000, from: 'W1N1', to: 'W2N1', description: 'gift <3',
		} as const;

		test('a transfer is stored once and referenced by both parties', () => storageSim(async ({ shard }) => {
			using clock = new DeterministicClockForTesting();
			await recordTransaction(shard, '100', '101', fields);
			const [ sender, recipient ] = await Promise.all([
				loadTransactionEntries(shard, '100'),
				loadTransactionEntries(shard, '101'),
			]);

			// The sender references it as outgoing only; the recipient as incoming only.
			assert.strictEqual(sender.outgoing.length, 1);
			assert.strictEqual(sender.incoming.length, 0);
			assert.strictEqual(recipient.incoming.length, 1);
			assert.strictEqual(recipient.outgoing.length, 0);
			const id = sender.outgoing[0]!;
			assert.strictEqual(recipient.incoming[0], id);

			// One shared blob holds the user ids and the raw (unescaped) description.
			const transaction = read(await loadTransactionBlob(shard, id));
			assert.strictEqual(transaction.transactionId, id);
			assert.strictEqual(transaction.time, 10);
			assert.strictEqual(transaction.resourceType, C.RESOURCE_ENERGY);
			assert.strictEqual(transaction.amount, 1000);
			assert.strictEqual(transaction.from, 'W1N1');
			assert.strictEqual(transaction.to, 'W2N1');
			assert.strictEqual(transaction['#sender'], '100');
			assert.strictEqual(transaction['#recipient'], '101');
			assert.strictEqual(transaction['#description'], 'gift <3');
			// The getter escapes `<` for the runtime.
			assert.strictEqual(transaction.description, 'gift &lt;3');
		}));

		test('transfers are ordered reverse chronologically', () => storageSim(async ({ shard }) => {
			using clock = new DeterministicClockForTesting();
			await recordTransaction(shard, '100', '101', { ...fields, time: 10 });
			await recordTransaction(shard, '100', '101', { ...fields, time: 20 });
			const { outgoing } = await loadTransactionEntries(shard, '100');
			const blobList = await Fn.mapAwait(outgoing, id => loadTransactionBlob(shard, id));
			const blobs = Fn.fromEntries(outgoing, (id, index) => [ id, blobList[index]! ] as const);
			const transactions = new Transactions({ incoming: [], outgoing, blobs });
			assert.strictEqual(transactions.outgoing[0]?.time, 20);
			assert.strictEqual(transactions.outgoing[1]?.time, 10);
		}));

		// User '200' owns terminals in both rooms, so a send to the neighbour is visible to itself from
		// both ends — exercising the processor → driver → runtime read path with one sandbox.
		const selfSendSim = simulate({
			W1N1: room => {
				const terminal = createTerminal(new RoomPosition(25, 25, 'W1N1'), '200');
				terminal.store['#add'](C.RESOURCE_ENERGY, 10000);
				room['#insertObject'](terminal);
				room['#level'] = 8;
				room['#user'] = room.controller!['#user'] = '200';
			},
			W2N1: room => {
				room['#insertObject'](createTerminal(new RoomPosition(25, 25, 'W2N1'), '200'));
				room['#level'] = 8;
				room['#user'] = room.controller!['#user'] = '200';
			},
		});

		test('a send appears to both parties with a resolved name and an escaped description', () => selfSendSim(async ({ sandbox, shard, tick }) => {
			using clock = new DeterministicClockForTesting();
			using player = await sandbox('200', global => {
				const { market } = global.Game;
				if (global.Memory.sent === undefined) {
					// First tick: send to our own terminal in the neighbouring room.
					global.Memory.sent = true;
					global.Game.rooms.W1N1?.terminal?.send('energy', 1000, 'W2N1', 'gift <3');
				} else {
					// A later tick, once the connector has shipped the transaction to both lists.
					const outgoing = market.outgoingTransactions;
					const incoming = market.incomingTransactions;
					assert.strictEqual(outgoing.length, 1);
					assert.strictEqual(incoming.length, 1);
					const transaction = outgoing[0];
					// One record, seen from both ends.
					assert.strictEqual(transaction?.transactionId, incoming[0]!.transactionId);
					assert.strictEqual(transaction.amount, 1000);
					assert.strictEqual(transaction.from, 'W1N1');
					assert.strictEqual(transaction.to, 'W2N1');
					assert.strictEqual(transaction.resourceType, 'energy');
					// Both parties are this user; the stored ids resolve to one username.
					assert.strictEqual(typeof transaction.sender?.username, 'string');
					assert.strictEqual(transaction.sender?.username, transaction.recipient?.username);
					// The description is stored raw and escaped at read.
					assert.strictEqual(transaction.description, 'gift &lt;3');
				}
			});
			// Send (tick 1), then read once the connector ships it (tick 2).
			await tick(2);

			// The transfer reached storage and is referenced from both of the user's lists.
			const refs = await loadTransactionEntries(shard, '200');
			assert.strictEqual(refs.outgoing.length, 1);
			assert.strictEqual(refs.incoming.length, 1);
			assert.strictEqual(refs.outgoing[0], refs.incoming[0]);
		}));

		// '201' owns W1N1 and '202' owns W2N1, so the sender is not visible in any of the recipient's
		// rooms — its username can only resolve through the runner's `userIds` path.
		const crossSendSim = simulate({
			W1N1: room => {
				const terminal = createTerminal(new RoomPosition(25, 25, 'W1N1'), '201');
				terminal.store['#add'](C.RESOURCE_ENERGY, 10000);
				room['#insertObject'](terminal);
				room['#level'] = 8;
				room['#user'] = room.controller!['#user'] = '201';
			},
			W2N1: room => {
				room['#insertObject'](createTerminal(new RoomPosition(25, 25, 'W2N1'), '202'));
				room['#level'] = 8;
				room['#user'] = room.controller!['#user'] = '202';
			},
		});

		test("the recipient resolves the sender's name though they share no room", () => crossSendSim(async ({ sandbox, shard, tick }) => {
			using clock = new DeterministicClockForTesting();
			using sender = await sandbox('201', global => {
				if (global.Memory.sent === undefined) {
					global.Memory.sent = true;
					global.Game.rooms.W1N1?.terminal?.send('energy', 1000, 'W2N1', 'gift <3');
				}
			});
			using recipient = await sandbox('202', global => {
				const incoming = global.Game.market.incomingTransactions;
				if (incoming.length > 0) {
					const transaction = incoming[0];
					assert.strictEqual(transaction?.from, 'W1N1');
					assert.strictEqual(transaction.to, 'W2N1');
					assert.strictEqual(transaction.amount, 1000);
					assert.strictEqual(transaction.description, 'gift &lt;3');
					// The sender shares no room with the reader; its name resolves via `payload.userIds`.
					assert.strictEqual(typeof transaction.sender?.username, 'string');
				}
			});
			// Send (tick 1), then read once the connector ships it (tick 2).
			await tick(2);

			// The transfer reached the recipient's incoming list and no outgoing list.
			const refs = await loadTransactionEntries(shard, '202');
			assert.strictEqual(refs.incoming.length, 1);
			assert.strictEqual(refs.outgoing.length, 0);
		}));

		test('transactions default to empty until loaded', () => {
			const market = new Market({ map: {} } as unknown as GameBase);
			assert.deepStrictEqual(market.incomingTransactions, []);
			assert.deepStrictEqual(market.outgoingTransactions, []);
			assert.strictEqual(market.credits, 0);
			assert.deepStrictEqual(market.orders, {});
			assert.deepStrictEqual(market.getAllOrders(), []);
		});
	});

	describe('send', () => {
		const sendSim = simulate({
			W1N1: room => {
				const terminal = createTerminal(new RoomPosition(25, 25, 'W1N1'), '100');
				terminal.store['#add'](C.RESOURCE_ENERGY, 10000);
				room['#insertObject'](terminal);
				room['#level'] = 8;
				room['#user'] = room.controller!['#user'] = '100';
			},
			W2N1: room => {
				room['#insertObject'](createTerminal(new RoomPosition(25, 25, 'W2N1'), '100'));
				room['#level'] = 8;
				room['#user'] = room.controller!['#user'] = '100';
			},
		});

		test('send sets the sender cooldown but not the receiver', () => sendSim(async ({ player, tick }) => {
			await player('100', Game => {
				const terminal = lookForStructures(Game.rooms.W1N1, C.STRUCTURE_TERMINAL)[0];
				assert.strictEqual(terminal?.send(C.RESOURCE_ENERGY, 1000, 'W2N1'), C.OK);
			});
			await tick();
			await player('100', Game => {
				const sender = lookForStructures(Game.rooms.W1N1, C.STRUCTURE_TERMINAL)[0];
				const receiver = lookForStructures(Game.rooms.W2N1, C.STRUCTURE_TERMINAL)[0];
				// Observable cooldown is TERMINAL_COOLDOWN - 1: the processor writes
				// cooldownTime at gameTime = T and user code reads it at time = T + 1.
				assert.strictEqual(sender?.cooldown, C.TERMINAL_COOLDOWN - 1);
				assert.strictEqual(receiver?.cooldown, 0, 'only the sender cools down');
			});
		}));

		test('a second send during cooldown returns ERR_TIRED', () => sendSim(async ({ player, tick }) => {
			await player('100', Game => {
				const terminal = lookForStructures(Game.rooms.W1N1, C.STRUCTURE_TERMINAL)[0];
				terminal?.send(C.RESOURCE_ENERGY, 1000, 'W2N1');
			});
			await tick();
			await player('100', Game => {
				const terminal = lookForStructures(Game.rooms.W1N1, C.STRUCTURE_TERMINAL)[0];
				assert.strictEqual(terminal?.send(C.RESOURCE_ENERGY, 1000, 'W2N1'), C.ERR_TIRED);
			});
		}));
	});

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

	describe('orders', () => {

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
	});

	describe('createOrder pipeline', () => {
		test('createOrder reaches the book; the connector ships the active book and your orders', async () => {
			const sim = makeMarketSim('200');
			await sim(async ({ sandbox, shard, tick }) => {
				using player = await sandbox('200', global => {
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
});
