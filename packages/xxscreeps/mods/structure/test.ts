import * as C from 'xxscreeps/game/constants/index.js';
import { RoomPosition } from 'xxscreeps/game/position.js';
import { create as createCreep } from 'xxscreeps/mods/creep/creep.js';
import { create as createExtractor } from 'xxscreeps/mods/mineral/extractor.js';
import { create as createRoad } from 'xxscreeps/mods/road/road.js';
import { create as createSpawn } from 'xxscreeps/mods/spawn/spawn.js';
import { createRuin } from 'xxscreeps/mods/structure/ruin.js';
import { assert, describe, simulate, test } from 'xxscreeps/test/index.js';

describe('Structure isActive', () => {
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
});

describe('FIND_ constants for structures', () => {
	// Room W7N1: owned spawn (player 100), hostile spawn (player 101), unowned road, and a ruin
	const sim = simulate({
		W7N1: room => {
			room['#level'] = 3;
			room['#user'] = room.controller!['#user'] = '100';
			room['#insertObject'](createSpawn(new RoomPosition(23, 25, 'W7N1'), '100', 'MySpawn'));
			room['#insertObject'](createSpawn(new RoomPosition(25, 25, 'W7N1'), '101', 'HostileSpawn'));
			room['#insertObject'](createRoad(new RoomPosition(20, 25, 'W7N1')));
			room['#insertObject'](createRuin(createRoad(new RoomPosition(27, 25, 'W7N1'))));
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
			assert.strictEqual(ruins[0]!.structureType, C.STRUCTURE_ROAD);
			assert.ok(ruins[0]!.ticksToDecay! > 0, 'ruin should have ticksToDecay property');
		});
	}));
});
