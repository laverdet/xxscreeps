import * as C from 'xxscreeps/game/constants/index.js';
import { RoomPosition } from 'xxscreeps/game/position.js';
import { create as createCreep } from 'xxscreeps/mods/classic/creep/creep.js';
import { create as createExtractor } from 'xxscreeps/mods/classic/mineral/extractor.js';
import { create as createRoad } from 'xxscreeps/mods/classic/road/road.js';
import { create as createExtension } from 'xxscreeps/mods/classic/spawn/extension.js';
import { create as createSpawn } from 'xxscreeps/mods/classic/spawn/spawn.js';
import { assert, describe, simulate, test } from 'xxscreeps/test/index.js';
import { createRuin } from './ruin.js';

describe('mod/classic/structure', () => {
	describe('isActive', () => {
		// Controller owner mismatch: structure owned by player A in room controlled by player B
		const ownerMismatchSim = simulate({
			W4N1: room => {
				room['#insertObject'](createSpawn(new RoomPosition(25, 25, 'W4N1'), '100', 'ConqueredSpawn'));
				room['#level'] = 4;
				room['#user'] = room.controller!['#user'] = '101'; // controller owned by different player
			},
		});

		test('structure inactive when controller owner differs', () => ownerMismatchSim(async ({ player }) => {
			await player('100', Game => {
				const spawn = Game.spawns.ConqueredSpawn;
				assert.ok(spawn, 'should see own spawn');
				assert.strictEqual(spawn.isActive(), false, 'spawn should be inactive when controller owned by another player');
			});
		}));

		// Distance-based tiebreaker: closer spawn to controller stays active
		const distanceSim = simulate({
			W5N1: room => {
				// Controller is at default position; place spawns at different distances
				const controllerPos = room.controller!.pos;
				// Spawn close to controller
				room['#insertObject'](createSpawn(new RoomPosition(controllerPos.x - 1, controllerPos.y, 'W5N1'), '100', 'CloseSpawn'));
				// Spawn far from controller
				room['#insertObject'](createSpawn(new RoomPosition(1, 1, 'W5N1'), '100', 'FarSpawn'));
				room['#level'] = 1; // RCL 1 allows only 1 spawn
				room['#user'] = room.controller!['#user'] = '100';
			},
		});

		test('closer spawn to controller stays active on RCL downgrade', () => distanceSim(async ({ player }) => {
			await player('100', Game => {
				const close = Game.spawns.CloseSpawn;
				const far = Game.spawns.FarSpawn;
				assert.ok(close && far, 'both spawns should exist');
				assert.strictEqual(close.isActive(), true, 'closer spawn should be active');
				assert.strictEqual(far.isActive(), false, 'farther spawn should be inactive');
			});
		}));

		// Hostile spawn nearer the controller: only the owner's structures count against the cap
		const hostileCrowdingSim = simulate({
			W9N1: room => {
				const controllerPos = room.controller!.pos;
				room['#insertObject'](createSpawn(new RoomPosition(controllerPos.x + 1, controllerPos.y, 'W9N1'), '101', 'HostileSpawn'));
				room['#insertObject'](createSpawn(new RoomPosition(controllerPos.x + 2, controllerPos.y - 2, 'W9N1'), '100', 'MySpawn'));
				room['#level'] = 1; // RCL 1 allows only 1 spawn
				room['#user'] = room.controller!['#user'] = '100';
			},
		});

		test('closer hostile spawn does not consume a ranking slot', () => hostileCrowdingSim(async ({ player }) => {
			await player('100', Game => {
				const spawn = Game.spawns.MySpawn;
				assert.ok(spawn, 'should see own spawn');
				assert.strictEqual(spawn.isActive(), true, 'owner spawn should be active despite closer hostile spawn');
			});
			await player('101', Game => {
				const spawn = Game.spawns.HostileSpawn;
				assert.ok(spawn, 'should see own spawn');
				assert.strictEqual(spawn.isActive(), false, 'hostile spawn should be inactive');
			});
		}));

		// Extractor isActive check on mineral harvest — use room's existing mineral
		const extractorSim = simulate({
			W6N1: room => {
				const mineral = room.find(C.FIND_MINERALS)[0]!;
				mineral.mineralAmount = 1000;
				room['#insertObject'](createExtractor(mineral.pos, '100'));
				room['#insertObject'](createCreep(mineral.pos, [ C.WORK, C.CARRY, C.MOVE ], 'miner', '100'));
				room['#level'] = 5; // extractors require RCL 6
				room['#user'] = room.controller!['#user'] = '100';
			},
		});

		test('harvest returns ERR_RCL_NOT_ENOUGH with inactive extractor', () => extractorSim(async ({ player }) => {
			await player('100', Game => {
				const creep = Game.creeps.miner;
				const mineral = Game.rooms.W6N1?.find(C.FIND_MINERALS)[0];
				assert.ok(mineral, 'mineral should exist');
				assert.strictEqual(creep?.harvest(mineral), C.ERR_RCL_NOT_ENOUGH);
			});
		}));

		// Owner-less extractor: always active, so the RCL gate doesn't apply
		const unownedExtractorSim = simulate({
			W6N1: room => {
				const mineral = room.find(C.FIND_MINERALS)[0]!;
				mineral.mineralAmount = 1000;
				room['#insertObject'](createExtractor(mineral.pos, null));
				room['#insertObject'](createCreep(mineral.pos, [ C.WORK, C.CARRY, C.MOVE ], 'miner', '100'));
				room['#level'] = 5;
				room['#user'] = room.controller!['#user'] = '100';
			},
		});

		test('owner-less extractor is active below required RCL', () => unownedExtractorSim(async ({ player }) => {
			await player('100', Game => {
				const creep = Game.creeps.miner;
				const mineral = Game.rooms.W6N1?.find(C.FIND_MINERALS)[0];
				assert.ok(mineral, 'mineral should exist');
				assert.strictEqual(creep?.harvest(mineral), C.OK);
			});
		}));

		// 6 extensions in a row, controller at (33, 32). RCL3 cap = 10; RCL2 cap = 5.
		// After downgrade to RCL2 the farthest extension (distance 6) drops to inactive.
		const downgradeSim = simulate({
			W3N3: room => {
				room['#level'] = 3;
				room['#user'] = room.controller!['#user'] = '100';
				room.controller!['#downgradeTime'] = 1;
				for (let dx = 1; dx <= 6; ++dx) {
					room['#insertObject'](createExtension(new RoomPosition(28 + dx, 32, 'W3N3'), 3, '100'));
				}
			},
		});

		test('downgrade transition flips #active on over-cap extension', () => downgradeSim(async ({ player, tick }) => {
			await player('100', Game => {
				const extensions = Game.rooms.W3N3?.find(C.FIND_MY_STRUCTURES)
					.filter(({ structureType }) => structureType === C.STRUCTURE_EXTENSION);
				assert.strictEqual(extensions?.length, 6);
				assert.ok(extensions.every(structure => structure.isActive()), 'all 6 extensions active at RCL3');
			});
			await tick();
			await player('100', Game => {
				const extensions = Game.rooms.W3N3?.find(C.FIND_MY_STRUCTURES)
					.filter(({ structureType }) => structureType === C.STRUCTURE_EXTENSION);
				assert.strictEqual(Game.rooms.W3N3?.controller!.level, 2);
				assert.strictEqual(extensions?.filter(structure => structure.isActive()).length, 5, 'only 5 active at RCL2');
				assert.strictEqual(extensions.filter(structure => !structure.isActive()).length, 1, 'farthest extension inactive');
			});
		}));
	});

	describe('FIND_ constants', () => {
		// Room W7N1: owned spawn (player 100), hostile spawn (player 101), unowned road, and a ruin
		const sim = simulate({
			W7N1: room => {
				room['#level'] = 3;
				room['#user'] = room.controller!['#user'] = '100';
				room['#insertObject'](createSpawn(new RoomPosition(23, 25, 'W7N1'), '100', 'MySpawn'));
				room['#insertObject'](createSpawn(new RoomPosition(25, 25, 'W7N1'), '101', 'HostileSpawn'));
				room['#insertObject'](createRoad(new RoomPosition(20, 25, 'W7N1')));
				room['#insertObject'](createRuin(createSpawn(new RoomPosition(27, 25, 'W7N1'), '100', 'RuinedSpawn')));
			},
			W8N1: room => {
				// Unowned controller, no structures, a creep to provide vision
				room['#insertObject'](createCreep(new RoomPosition(25, 25, 'W8N1'), [ C.MOVE ], 'Explorer', '100'));
			},
		});

		test('FIND_STRUCTURES returns all structures including unowned', () => sim(async ({ player }) => {
			await player('100', Game => {
				const structures = Game.rooms.W7N1?.find(C.FIND_STRUCTURES);
				assert.ok(structures);
				assert.strictEqual(structures.length, 4, 'should return all structures including unowned and controller');
			});
		}));

		test('FIND_MY_STRUCTURES returns only my owned structures', () => sim(async ({ player }) => {
			await player('100', Game => {
				const mine = Game.rooms.W7N1?.find(C.FIND_MY_STRUCTURES);
				assert.ok(mine);
				assert.strictEqual(mine.length, 2, 'should return only my owned structures, including controller');
				assert.ok(mine.some(s => (s as { name?: string }).name === 'MySpawn'));
				assert.ok(mine.every(s => s.my));
			});
		}));

		test('FIND_HOSTILE_STRUCTURES returns only hostile owned structures', () => sim(async ({ player }) => {
			await player('100', Game => {
				const hostile = Game.rooms.W7N1?.find(C.FIND_HOSTILE_STRUCTURES);
				assert.ok(hostile);
				assert.strictEqual(hostile.length, 1, 'only the hostile spawn should be returned');
				assert.strictEqual((hostile[0] as { name?: string }).name, 'HostileSpawn');
			});
		}));

		test('FIND_RUINS returns ruins and not living structures', () => sim(async ({ player }) => {
			await player('100', Game => {
				const ruins = Game.rooms.W7N1?.find(C.FIND_RUINS);
				assert.ok(ruins);
				assert.strictEqual(ruins.length, 1);
				assert.strictEqual(ruins[0]!.structureType, C.STRUCTURE_SPAWN);
				assert.ok(ruins[0]!.ticksToDecay! > 0, 'ruin should have ticksToDecay property');
			});
		}));

		test('FIND_STRUCTURES in unowned room returns controller', () => sim(async ({ player }) => {
			await player('100', Game => {
				const structures = Game.rooms.W8N1?.find(C.FIND_STRUCTURES);
				assert.ok(structures);
				assert.strictEqual(structures.length, 1, 'should return only the controller');
				assert.strictEqual(structures[0]!.structureType, C.STRUCTURE_CONTROLLER);
			});
		}));

		test('FIND_MY_STRUCTURES in unowned room returns empty array', () => sim(async ({ player }) => {
			await player('100', Game => {
				const mine = Game.rooms.W8N1?.find(C.FIND_MY_STRUCTURES);
				assert.ok(mine);
				assert.strictEqual(mine.length, 0, 'should return empty array in unowned room');
			});
		}));

		test('FIND_HOSTILE_STRUCTURES in unowned room returns empty array', () => sim(async ({ player }) => {
			await player('100', Game => {
				const hostile = Game.rooms.W8N1?.find(C.FIND_HOSTILE_STRUCTURES);
				assert.ok(hostile);
				assert.strictEqual(hostile.length, 0, 'should return empty array in unowned room');
			});
		}));
	});
});
