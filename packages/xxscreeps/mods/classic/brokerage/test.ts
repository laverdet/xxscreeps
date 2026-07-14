import { Fn } from 'xxscreeps/functional/fn.js';
import * as C from 'xxscreeps/game/constants/index.js';
import { RoomPosition } from 'xxscreeps/game/position.js';
import { lookForStructures } from 'xxscreeps/mods/classic/structure/structure.js';
import { DeterministicClockForTesting } from 'xxscreeps/test/fixtures.js';
import { assert, describe, simulate, test } from 'xxscreeps/test/index.js';
import { loadTransactionBlob, loadTransactionEntries, recordTransaction } from './model.js';
import { create as createTerminal } from './terminal.js';
import { Transactions, read } from './transaction.js';

describe('mod/classic/brokerage', () => {
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
});
