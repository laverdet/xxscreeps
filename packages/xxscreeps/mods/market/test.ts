import type { GameBase } from 'xxscreeps/game/game.js';
import { Fn } from 'xxscreeps/functional/fn.js';
import * as C from 'xxscreeps/game/constants/index.js';
import { RoomPosition } from 'xxscreeps/game/position.js';
import { lookForStructures } from 'xxscreeps/mods/classic/structure/structure.js';
import { assert, describe, simulate, test } from 'xxscreeps/test/index.js';
import { deterministicClockForTesting } from 'xxscreeps/utility/utility.js';
import { Market } from './market.js';
import { loadTransactionBlob, loadTransactionEntries, recordTransaction } from './model.js';
import { create as createTerminal } from './terminal.js';
import { Transactions, read } from './transaction.js';

describe('Market transactions', () => {

	// Storage only — `recordTransaction` doesn't touch rooms, and users '100'/'101' exist by default.
	const storageSim = simulate({});
	const fields = {
		time: 10, resourceType: C.RESOURCE_ENERGY, amount: 1000, from: 'W1N1', to: 'W2N1', description: 'gift <3',
	} as const;

	test('a transfer is stored once and referenced by both parties', () => storageSim(async ({ shard }) => {
		using clock = deterministicClockForTesting();
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
		using clock = deterministicClockForTesting();
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
		using clock = deterministicClockForTesting();
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
		using clock = deterministicClockForTesting();
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
});

describe('Market', () => {

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

	test('transactions default to empty until loaded', () => {
		const market = new Market({ map: {} } as unknown as GameBase);
		assert.deepStrictEqual(market.incomingTransactions, []);
		assert.deepStrictEqual(market.outgoingTransactions, []);
	});
});
