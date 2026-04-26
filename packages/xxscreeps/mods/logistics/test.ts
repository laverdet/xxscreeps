import * as C from 'xxscreeps/game/constants/index.js';
import { RoomPosition } from 'xxscreeps/game/position.js';
import { lookForStructures } from 'xxscreeps/mods/structure/structure.js';
import { assert, describe, simulate, test } from 'xxscreeps/test/index.js';
import { create as createLink } from './link.js';

describe('Link', () => {
	const sim = simulate({
		W1N1: room => {
			room['#level'] = 5;
			room['#user'] = room.controller!['#user'] = '100';
			const sender = createLink(new RoomPosition(25, 25, 'W1N1'), '100');
			sender.store['#add'](C.RESOURCE_ENERGY, 800);
			room['#insertObject'](sender);
			room['#insertObject'](createLink(new RoomPosition(27, 25, 'W1N1'), '100'));
		},
	});

	// Vanilla emits the pre-loss amount; LINK_LOSS_RATIO is applied to receiver only.
	test('transferEnergy emits EVENT_TRANSFER with the pre-loss amount', () => sim(async ({ player, tick }) => {
		await player('100', Game => {
			const [ sender, receiver ] = lookForStructures(Game.rooms.W1N1, C.STRUCTURE_LINK);
			assert.strictEqual(sender.transferEnergy(receiver, 400), C.OK);
		});
		await tick();
		await player('100', Game => {
			const [ sender, receiver ] = lookForStructures(Game.rooms.W1N1, C.STRUCTURE_LINK);
			const log = Game.rooms.W1N1.getEventLog();
			const transfer = log.find(event => event.event === C.EVENT_TRANSFER);
			assert.ok(transfer, 'expected EVENT_TRANSFER from link transfer');
			assert.strictEqual(transfer.objectId, sender.id);
			assert.strictEqual(transfer.data.targetId, receiver.id);
			assert.strictEqual(transfer.data.resourceType, C.RESOURCE_ENERGY);
			assert.strictEqual(transfer.data.amount, 400);
			assert.strictEqual(receiver.store[C.RESOURCE_ENERGY], Math.floor(400 * (1 - C.LINK_LOSS_RATIO)));
		});
	}));
});
