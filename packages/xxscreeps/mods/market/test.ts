import * as C from 'xxscreeps/game/constants/index.js';
import { RoomPosition } from 'xxscreeps/game/position.js';
import { lookForStructures } from 'xxscreeps/mods/structure/structure.js';
import { assert, describe, simulate, test } from 'xxscreeps/test/index.js';
import { create as createTerminal } from './terminal.js';

describe('Market', () => {

	// =========================================================================
	// send
	// =========================================================================
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
				const terminal = lookForStructures(Game.rooms.W1N1, C.STRUCTURE_TERMINAL)[0]!;
				assert.strictEqual(terminal.send(C.RESOURCE_ENERGY, 1000, 'W2N1'), C.OK);
			});
			await tick();
			await player('100', Game => {
				const sender = lookForStructures(Game.rooms.W1N1, C.STRUCTURE_TERMINAL)[0]!;
				const receiver = lookForStructures(Game.rooms.W2N1, C.STRUCTURE_TERMINAL)[0]!;
				// Observable cooldown is TERMINAL_COOLDOWN - 1: the processor writes
				// cooldownTime at gameTime = T and user code reads it at time = T + 1.
				assert.strictEqual(sender.cooldown, C.TERMINAL_COOLDOWN - 1);
				assert.strictEqual(receiver.cooldown, 0, 'only the sender cools down');
			});
		}));

		test('a second send during cooldown returns ERR_TIRED', () => sendSim(async ({ player, tick }) => {
			await player('100', Game => {
				const terminal = lookForStructures(Game.rooms.W1N1, C.STRUCTURE_TERMINAL)[0]!;
				terminal.send(C.RESOURCE_ENERGY, 1000, 'W2N1');
			});
			await tick();
			await player('100', Game => {
				const terminal = lookForStructures(Game.rooms.W1N1, C.STRUCTURE_TERMINAL)[0]!;
				assert.strictEqual(terminal.send(C.RESOURCE_ENERGY, 1000, 'W2N1'), C.ERR_TIRED);
			});
		}));
	});
});
