import type { StructureLink } from './link.js';
import type { Room } from 'xxscreeps/game/room/index.js';
import * as C from 'xxscreeps/game/constants/index.js';
import { RoomPosition } from 'xxscreeps/game/position.js';
import { lookForStructures } from 'xxscreeps/mods/structure/structure.js';
import { assert, describe, simulate, test } from 'xxscreeps/test/index.js';
import { create as createLink } from './link.js';

function own(room: Room, level: number) {
	room['#level'] = level;
	room['#user'] = room.controller!['#user'] = '100';
}

function insertLink(room: Room, xx: number, yy: number, owner: string, energy = 0) {
	const link = createLink(new RoomPosition(xx, yy, room.name), owner);
	link.store['#add'](C.RESOURCE_ENERGY, energy);
	room['#insertObject'](link);
	return link;
}

function getLink(room: Room | undefined, xx: number, yy: number) {
	const link = lookForStructures(room, C.STRUCTURE_LINK)
		.find(link => link.pos.x === xx && link.pos.y === yy);
	assert.ok(link, `expected link at ${xx},${yy}`);
	return link;
}

describe('Link', () => {
	const sim = simulate({
		W1N1: room => {
			own(room, 5);
			insertLink(room, 25, 25, '100', 800);
			insertLink(room, 27, 25, '100');
		},
	});

	const precedence = simulate({
		W1N1: room => {
			own(room, 5);
			insertLink(room, 25, 25, '100', 800);
			insertLink(room, 27, 25, '100');
		},
		W1N2: room => {
			own(room, 5);
			insertLink(room, 25, 25, '100', 800);
			insertLink(room, 27, 25, '101');
		},
		W1N3: room => {
			own(room, 4);
			insertLink(room, 25, 25, '100', 800);
			insertLink(room, 27, 25, '100');
		},
		W1N4: room => {
			own(room, 4);
			insertLink(room, 25, 25, '100', 800);
			insertLink(room, 27, 25, '101');
		},
		W1N5: room => {
			own(room, 5);
			insertLink(room, 25, 25, '101', 800);
			insertLink(room, 27, 25, '100');
		},
		W1N6: room => {
			own(room, 4);
			const source = insertLink(room, 25, 25, '100', 800);
			source['#cooldownTime'] = 100;
			insertLink(room, 27, 25, '100');
		},
		W1N7: room => {
			own(room, 5);
			const source = insertLink(room, 25, 25, '100');
			source['#cooldownTime'] = 100;
			insertLink(room, 27, 25, '100');
		},
		W1N8: room => {
			own(room, 5);
			const source = insertLink(room, 25, 25, '100', 800);
			source['#cooldownTime'] = 100;
			insertLink(room, 27, 25, '100', 800);
		},
		W2N1: room => {
			own(room, 5);
			const source = insertLink(room, 25, 25, '100', 800);
			source['#cooldownTime'] = 100;
		},
		W2N2: room => {
			own(room, 5);
			insertLink(room, 27, 25, '100');
		},
	});

	// Vanilla emits the pre-loss amount; LINK_LOSS_RATIO is applied to receiver only.
	test('transferEnergy emits EVENT_TRANSFER with the pre-loss amount', () => sim(async ({ player, tick }) => {
		await player('100', Game => {
			const [ sender, receiver ] = lookForStructures(Game.rooms.W1N1, C.STRUCTURE_LINK);
			assert.strictEqual(sender?.transferEnergy(receiver!, 400), C.OK);
		});
		await tick();
		await player('100', Game => {
			const [ sender, receiver ] = lookForStructures(Game.rooms.W1N1, C.STRUCTURE_LINK);
			const log = Game.rooms.W1N1?.getEventLog();
			const transfer = log?.find(event => event.event === C.EVENT_TRANSFER);
			assert.ok(transfer, 'expected EVENT_TRANSFER from link transfer');
			assert.strictEqual(transfer.objectId, sender?.id);
			assert.ok(transfer.data, 'expected nested data payload');
			assert.strictEqual(transfer.data.targetId, receiver?.id);
			assert.strictEqual(transfer.data.resourceType, C.RESOURCE_ENERGY);
			assert.strictEqual(transfer.data.amount, 400);
			assert.strictEqual(receiver?.store[C.RESOURCE_ENERGY], Math.floor(400 * (1 - C.LINK_LOSS_RATIO)));
		});
	}));

	test('LINK-014:cooldown-before-rcl', () => precedence(async ({ player }) => {
		await player('100', Game => {
			const source = getLink(Game.rooms.W1N6, 25, 25);
			const target = getLink(Game.rooms.W1N6, 27, 25);
			assert.strictEqual(source.transferEnergy(target, 1), C.ERR_TIRED);
		});
	}));

	test('cooldown-before-range', () => precedence(async ({ player }) => {
		await player('100', Game => {
			const source = getLink(Game.rooms.W2N1, 25, 25);
			const target = getLink(Game.rooms.W2N2, 27, 25);
			assert.strictEqual(source.transferEnergy(target, 1), C.ERR_TIRED);
		});
	}));

	test('cooldown-before-not-enough', () => precedence(async ({ player }) => {
		await player('100', Game => {
			const source = getLink(Game.rooms.W1N7, 25, 25);
			const target = getLink(Game.rooms.W1N7, 27, 25);
			assert.strictEqual(source.transferEnergy(target, 1), C.ERR_TIRED);
		});
	}));

	test('cooldown-before-full', () => precedence(async ({ player }) => {
		await player('100', Game => {
			const source = getLink(Game.rooms.W1N8, 25, 25);
			const target = getLink(Game.rooms.W1N8, 27, 25);
			assert.strictEqual(source.transferEnergy(target, 1), C.ERR_TIRED);
		});
	}));

	test('invalid-args-before-rcl', () => precedence(async ({ player }) => {
		await player('100', Game => {
			const source = getLink(Game.rooms.W1N3, 25, 25);
			const target = getLink(Game.rooms.W1N3, 27, 25);
			assert.strictEqual(source.transferEnergy(target, -1), C.ERR_INVALID_ARGS);
		});
	}));

	test('invalid-target-before-rcl', () => precedence(async ({ player }) => {
		await player('100', Game => {
			const source = getLink(Game.rooms.W1N3, 25, 25);
			assert.strictEqual(
				source.transferEnergy(Game.rooms.W1N3!.controller as unknown as StructureLink, 1),
				C.ERR_INVALID_TARGET);
		});
	}));

	test('target-not-owner-before-rcl', () => precedence(async ({ player }) => {
		await player('100', Game => {
			const source = getLink(Game.rooms.W1N4, 25, 25);
			const target = getLink(Game.rooms.W1N4, 27, 25);
			assert.strictEqual(source.transferEnergy(target, 1), C.ERR_NOT_OWNER);
		});
	}));

	test('invalid-args-before-source-not-owner', () => precedence(async ({ player }) => {
		await player('100', Game => {
			const source = getLink(Game.rooms.W1N5, 25, 25);
			const target = getLink(Game.rooms.W1N5, 27, 25);
			assert.strictEqual(source.transferEnergy(target, -1), C.ERR_INVALID_ARGS);
		});
	}));

	test('invalid-target-before-source-not-owner', () => precedence(async ({ player }) => {
		await player('100', Game => {
			const source = getLink(Game.rooms.W1N5, 25, 25);
			assert.strictEqual(
				source.transferEnergy(Game.rooms.W1N5!.controller as unknown as StructureLink, 1),
				C.ERR_INVALID_TARGET);
		});
	}));

	test('invalid-args-before-invalid-target', () => precedence(async ({ player }) => {
		await player('100', Game => {
			const source = getLink(Game.rooms.W1N1, 25, 25);
			assert.strictEqual(
				source.transferEnergy(Game.rooms.W1N1!.controller as unknown as StructureLink, -1),
				C.ERR_INVALID_ARGS);
		});
	}));

	test('invalid-args-before-target-not-owner', () => precedence(async ({ player }) => {
		await player('100', Game => {
			const source = getLink(Game.rooms.W1N2, 25, 25);
			const target = getLink(Game.rooms.W1N2, 27, 25);
			assert.strictEqual(source.transferEnergy(target, -1), C.ERR_INVALID_ARGS);
		});
	}));
});
