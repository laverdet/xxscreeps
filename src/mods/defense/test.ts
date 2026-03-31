import * as C from 'xxscreeps/game/constants/index.js';
import { RoomPosition } from 'xxscreeps/game/position.js';
import { create as createConstructionSite } from 'xxscreeps/mods/construction/construction-site.js';
import { create as createCreep } from 'xxscreeps/mods/creep/creep.js';
import { lookForStructures } from 'xxscreeps/mods/structure/structure.js';
import { assert, describe, simulate, test } from 'xxscreeps/test/index.js';
import { create as createRampart } from './rampart.js';

describe('ramparts', () => {
	const roomWithUnbuiltRamparts = simulate({
		W0N0: room => {
			room['#level'] = 3;
			room['#user'] = '100';
			room['#insertObject'](createCreep(new RoomPosition(24, 25, 'W0N0'), [ C.MOVE ], 'rampart_movement', '100'));
			room['#insertObject'](createConstructionSite(new RoomPosition(25, 25, 'W0N0'), 'rampart', '100'));
		},
	});

	test('moveTo should be able to pass trough rampart csite', () => roomWithUnbuiltRamparts(async ({ player, tick }) => {
		await player('100', Game => {
			assert.strictEqual(Game.creeps.rampart_movement.moveTo(25, 25), C.OK);
		});

		await tick();

		await player('100', Game => {
			const pos = Game.creeps.rampart_movement.pos;
			const { x, y } = pos;
			assert.strictEqual(x, 25);
			assert.strictEqual(y, 25);
		});
	}));

	test('move should be able to pass trough rampart csite', () => roomWithUnbuiltRamparts(async ({ player, tick }) => {
		await player('100', Game => {
			assert.strictEqual(Game.creeps.rampart_movement.move(C.RIGHT), C.OK);
		});

		await tick();

		await player('100', Game => {
			const pos = Game.creeps.rampart_movement.pos;
			const { x, y } = pos;
			assert.strictEqual(x, 25);
			assert.strictEqual(y, 25);
		});
	}));
});

describe('setPublic', () => {
	const roomWithRampart = simulate({
		W1N1: room => {
			room['#level'] = 3;
			room['#user'] = room.controller!['#user'] = '100';
			room['#insertObject'](createRampart(new RoomPosition(25, 25, 'W1N1'), '100'));
			room['#insertObject'](createCreep(new RoomPosition(24, 25, 'W1N1'), [ C.MOVE ], 'hostile', '101'));
		},
	});

	test('private rampart blocks hostile creep', () => roomWithRampart(async ({ player, tick }) => {
		await player('101', Game => {
			assert.strictEqual(Game.creeps.hostile.move(C.RIGHT), C.OK);
		});
		await tick();
		await player('101', Game => {
			assert(Game.creeps.hostile.pos.isEqualTo(24, 25), 'hostile creep should not have moved');
		});
	}));

	test('setPublic returns ERR_NOT_OWNER for non-owner', () => roomWithRampart(async ({ player }) => {
		await player('101', Game => {
			const rampart = lookForStructures(Game.rooms.W1N1, C.STRUCTURE_RAMPART)[0];
			assert.strictEqual(rampart.setPublic(true), C.ERR_NOT_OWNER);
		});
	}));

	test('public rampart allows hostile creep', () => roomWithRampart(async ({ player, tick }) => {
		await player('100', Game => {
			const rampart = lookForStructures(Game.rooms.W1N1, C.STRUCTURE_RAMPART)[0];
			assert.strictEqual(rampart.setPublic(true), C.OK);
		});
		await tick();
		await player('101', Game => {
			assert.strictEqual(Game.creeps.hostile.move(C.RIGHT), C.OK);
		});
		await tick();
		await player('101', Game => {
			assert(Game.creeps.hostile.pos.isEqualTo(25, 25), 'hostile creep should have moved through public rampart');
		});
	}));
});
