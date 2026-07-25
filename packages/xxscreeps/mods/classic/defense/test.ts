import { RoomPosition } from 'xxscreeps/game/position.js';
import { create as createConstructionSite } from 'xxscreeps/mods/classic/construction/construction-site.js';
import { create as createCreep } from 'xxscreeps/mods/classic/creep/creep.js';
import { kInvaderUserId } from 'xxscreeps/mods/classic/invader/game.js';
import { lookForStructureAt, lookForStructures } from 'xxscreeps/mods/classic/structure/structure.js';
import { assert, describe, simulate, test } from 'xxscreeps/test/index.js';
import * as C from 'xxscreeps:mods/constants';
import { create as createRampart } from './rampart.js';
import { create as createTower } from './tower.js';

describe('mods/classic/defense', () => {
	describe('ramparts', () => {
		const roomWithUnbuiltRamparts = simulate({
			W0N0: room => {
				room['#level'] = 3;
				room['#user'] = '100';
				room['#insertObject'](createCreep(new RoomPosition(24, 25, 'W0N0'), [ C.MOVE ], 'rampart_movement', '100'));
				room['#insertObject'](createConstructionSite(new RoomPosition(25, 25, 'W0N0'), 'rampart', '100', C.CONSTRUCTION_COST.rampart));
			},
		});

		test('moveTo passes through rampart csite', () => roomWithUnbuiltRamparts(async ({ player, tick }) => {
			await player('100', Game => {
				assert.strictEqual(Game.creeps.rampart_movement?.moveTo(25, 25), C.OK);
			});

			await tick();

			await player('100', Game => {
				const pos = Game.creeps.rampart_movement?.pos;
				assert.strictEqual(pos?.x, 25);
				assert.strictEqual(pos.y, 25);
			});
		}));

		test('move passes through rampart csite', () => roomWithUnbuiltRamparts(async ({ player, tick }) => {
			await player('100', Game => {
				assert.strictEqual(Game.creeps.rampart_movement?.move(C.RIGHT), C.OK);
			});

			await tick();

			await player('100', Game => {
				const pos = Game.creeps.rampart_movement?.pos;
				assert.strictEqual(pos?.x, 25);
				assert.strictEqual(pos.y, 25);
			});
		}));
	});

	describe('hitsMax', () => {
		const roomWithRamparts = simulate({
			W2N2: room => {
				room['#level'] = 4;
				room['#user'] = room.controller!['#user'] = '100';
				room['#insertObject'](createCreep(new RoomPosition(24, 25, 'W2N2'), [ C.MOVE ], 'observer', '100'));
				room['#insertObject'](createRampart(new RoomPosition(25, 25, 'W2N2'), '100'));
				room['#insertObject'](createRampart(new RoomPosition(26, 25, 'W2N2'), '101'));
				room['#insertObject'](createRampart(new RoomPosition(27, 25, 'W2N2'), kInvaderUserId));
			},
		});

		test('a rampart scales with the controller its owner holds', () => roomWithRamparts(async ({ peekRoom }) => {
			await peekRoom('W2N2', room => {
				const maxAt = (xx: number) =>
					lookForStructureAt(room, new RoomPosition(xx, 25, 'W2N2'), C.STRUCTURE_RAMPART)?.hitsMax;
				assert.strictEqual(maxAt(25), C.RAMPART_HITS_MAX[4], "the controller owner's rampart scales with the level");
				assert.strictEqual(maxAt(26), 0, "another player's rampart has no maximum here");
				assert.strictEqual(maxAt(27), C.RAMPART_HITS_MAX[8], 'an invader rampart holds the RCL8 maximum');
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
				assert.strictEqual(Game.creeps.hostile?.move(C.RIGHT), C.OK);
			});
			await tick();
			await player('101', Game => {
				assert.ok(Game.creeps.hostile?.pos.isEqualTo(24, 25), 'hostile creep should not have moved');
			});
		}));

		test('setPublic returns ERR_NOT_OWNER for non-owner', () => roomWithRampart(async ({ player }) => {
			await player('101', Game => {
				const rampart = lookForStructures(Game.rooms.W1N1, C.STRUCTURE_RAMPART)[0];
				assert.strictEqual(rampart?.setPublic(true), C.ERR_NOT_OWNER);
			});
		}));

		test('public rampart allows hostile creep', () => roomWithRampart(async ({ player, tick }) => {
			await player('100', Game => {
				const rampart = lookForStructures(Game.rooms.W1N1, C.STRUCTURE_RAMPART)[0];
				assert.strictEqual(rampart?.setPublic(true), C.OK);
			});
			await tick();
			await player('101', Game => {
				assert.strictEqual(Game.creeps.hostile?.move(C.RIGHT), C.OK);
			});
			await tick();
			await player('101', Game => {
				assert.ok(Game.creeps.hostile?.pos.isEqualTo(25, 25), 'hostile creep should have moved through public rampart');
			});
		}));
	});

	describe('tower isActive', () => {
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
				assert.strictEqual(tower?.attack(Game.rooms.W3N2!.find(C.FIND_HOSTILE_CREEPS)[0]!), C.ERR_RCL_NOT_ENOUGH);
			});
		}));
	});
});
