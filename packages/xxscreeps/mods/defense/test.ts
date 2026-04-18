import * as C from 'xxscreeps/game/constants/index.js';
import { RoomPosition } from 'xxscreeps/game/position.js';
import { create as createConstructionSite } from 'xxscreeps/mods/construction/construction-site.js';
import { create as createCreep } from 'xxscreeps/mods/creep/creep.js';
import { lookForStructures } from 'xxscreeps/mods/structure/structure.js';
import { assert, describe, simulate, test } from 'xxscreeps/test/index.js';
import { create as createRampart } from './rampart.js';
import { create as createTower } from './tower.js';

describe('ramparts', () => {
	const roomWithUnbuiltRamparts = simulate({
		W0N0: room => {
			room['#level'] = 3;
			room['#user'] = '100';
			room['#insertObject'](createCreep(new RoomPosition(24, 25, 'W0N0'), [ C.MOVE ], 'rampart_movement', '100'));
			room['#insertObject'](createConstructionSite(new RoomPosition(25, 25, 'W0N0'), 'rampart', '100', C.CONSTRUCTION_COST.rampart));
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

describe('Tower isActive', () => {
	// Tower has energy so the energy check passes first (matching official check ordering),
	// verifying that ERR_RCL_NOT_ENOUGH comes from the isActive check in the intent chain
	const simulation = simulate({
		W3N2: room => {
			const tower = createTower(new RoomPosition(25, 25, 'W3N2'), '100');
			tower.store['#add'](C.RESOURCE_ENERGY, C.TOWER_ENERGY_COST);
			room['#insertObject'](tower);
			room['#insertObject'](createCreep(new RoomPosition(26, 25, 'W3N2'), [ C.MOVE ], 'target', '101'));
			room['#level'] = 2;
			room['#user'] = room.controller!['#user'] = '100';
		},
	});

	test('tower attack returns ERR_RCL_NOT_ENOUGH when inactive', () => simulation(async ({ player }) => {
		await player('100', Game => {
			const tower = lookForStructures(Game.rooms.W3N2, C.STRUCTURE_TOWER)[0];
			assert.strictEqual(tower.attack(Game.rooms.W3N2.find(C.FIND_HOSTILE_CREEPS)[0]), C.ERR_RCL_NOT_ENOUGH);
		});
	}));
});
