import * as Id from 'xxscreeps/engine/schema/id.js';
import * as C from 'xxscreeps/game/constants/index.js';
import * as RoomObject from 'xxscreeps/game/object.js';
import { RoomPosition } from 'xxscreeps/game/position.js';
import { create as createConstructionSite } from 'xxscreeps/mods/construction/construction-site.js';
import { create as createCreep } from 'xxscreeps/mods/creep/creep.js';
import { Tombstone } from 'xxscreeps/mods/creep/tombstone.js';
import { create as createRampart } from 'xxscreeps/mods/defense/rampart.js';
import { create as createWall } from 'xxscreeps/mods/defense/wall.js';
import { create as createResource } from 'xxscreeps/mods/resource/resource.js';
import { OpenStore } from 'xxscreeps/mods/resource/store.js';
import { create as createSpawn } from 'xxscreeps/mods/spawn/spawn.js';
import { createRuin } from 'xxscreeps/mods/structure/ruin.js';
import { lookForStructures } from 'xxscreeps/mods/structure/structure.js';
import { assert, describe, simulate, test } from 'xxscreeps/test/index.js';
import { create as createNuke } from './nuke.js';
import { create as createNuker } from './nuker.js';

function createLoadedNuker(pos: RoomPosition) {
	const nuker = createNuker(pos, '100');
	nuker.store['#add'](C.RESOURCE_ENERGY, C.NUKER_ENERGY_CAPACITY);
	nuker.store['#add'](C.RESOURCE_GHODIUM, C.NUKER_GHODIUM_CAPACITY);
	return nuker;
}

function createTestTombstone(pos: RoomPosition) {
	const tombstone = RoomObject.create(new Tombstone(), pos);
	tombstone.deathTime = 1;
	tombstone.store = new OpenStore();
	tombstone['#creep'] = {
		body: [ C.MOVE ],
		id: Id.generateId(),
		name: 'fallen',
		saying: undefined,
		ticksToLive: C.CREEP_LIFE_TIME,
		user: '100',
	};
	tombstone['#decayTime'] = C.TOMBSTONE_DECAY_PER_PART;
	return tombstone;
}

describe('Nuker', () => {
	const sim = simulate({
		W1N1: room => {
			room['#insertObject'](createLoadedNuker(new RoomPosition(25, 25, 'W1N1')));
			room['#level'] = 8;
			room['#user'] = room.controller!['#user'] = '100';
		},
		W2N1: room => {
			room['#level'] = 1;
			room['#user'] = room.controller!['#user'] = '101';
		},
	});

	test('store capacity is per-resource', () => sim(async ({ player }) => {
		await player('100', Game => {
			const nuker = lookForStructures(Game.rooms.W1N1, C.STRUCTURE_NUKER)[0]!;
			assert.strictEqual(nuker.store.getCapacity(C.RESOURCE_ENERGY), C.NUKER_ENERGY_CAPACITY);
			assert.strictEqual(nuker.store.getCapacity(C.RESOURCE_GHODIUM), C.NUKER_GHODIUM_CAPACITY);
			assert.strictEqual(nuker.store.getCapacity(C.RESOURCE_OXYGEN), null);
			assert.strictEqual(nuker.store.getFreeCapacity(C.RESOURCE_ENERGY), 0);
			assert.strictEqual(nuker.store.getUsedCapacity(C.RESOURCE_GHODIUM), C.NUKER_GHODIUM_CAPACITY);
			assert.strictEqual(nuker.energy, C.NUKER_ENERGY_CAPACITY);
			assert.strictEqual(nuker.ghodium, C.NUKER_GHODIUM_CAPACITY);
		});
	}));

	test('launchNuke drains store and starts cooldown', () => sim(async ({ player, tick }) => {
		await player('100', Game => {
			const nuker = lookForStructures(Game.rooms.W1N1, C.STRUCTURE_NUKER)[0]!;
			assert.strictEqual(nuker.cooldown, 0);
			assert.strictEqual(nuker.launchNuke(new RoomPosition(25, 25, 'W2N1')), C.OK);
		});
		await tick();
		await player('100', Game => {
			const nuker = lookForStructures(Game.rooms.W1N1, C.STRUCTURE_NUKER)[0]!;
			assert.strictEqual(nuker.energy, 0);
			assert.strictEqual(nuker.ghodium, 0);
			assert.strictEqual(nuker.cooldown, C.NUKER_COOLDOWN - 1);
		});
		await player('101', Game => {
			const nuke = Game.rooms.W2N1!['#lookFor'](C.LOOK_NUKES)[0]!;
			assert.strictEqual(nuke.timeToLand, C.NUKE_LAND_TIME - 1);
		});
	}));

	test('launchNuke returns ERR_TIRED while cooling down', () => sim(async ({ player, tick }) => {
		await player('100', Game => {
			const nuker = lookForStructures(Game.rooms.W1N1, C.STRUCTURE_NUKER)[0]!;
			assert.strictEqual(nuker.launchNuke(new RoomPosition(25, 25, 'W2N1')), C.OK);
		});
		await tick();
		await player('100', Game => {
			const nuker = lookForStructures(Game.rooms.W1N1, C.STRUCTURE_NUKER)[0]!;
			assert.strictEqual(nuker.launchNuke(new RoomPosition(25, 25, 'W2N1')), C.ERR_TIRED);
		});
	}));

	test('launchNuke returns ERR_NOT_IN_RANGE beyond NUKE_RANGE', () => sim(async ({ player }) => {
		await player('100', Game => {
			const nuker = lookForStructures(Game.rooms.W1N1, C.STRUCTURE_NUKER)[0]!;
			assert.strictEqual(nuker.launchNuke(new RoomPosition(25, 25, 'W20N20')), C.ERR_NOT_IN_RANGE);
		});
	}));

	test('launchNuke returns ERR_NOT_ENOUGH_RESOURCES when partially drained', () => sim(async ({ player, poke }) => {
		await poke('W1N1', '100', Game => {
			const nuker = lookForStructures(Game.rooms.W1N1, C.STRUCTURE_NUKER)[0]!;
			nuker.store['#subtract'](C.RESOURCE_GHODIUM, 1);
		});
		await player('100', Game => {
			const nuker = lookForStructures(Game.rooms.W1N1, C.STRUCTURE_NUKER)[0]!;
			assert.strictEqual(nuker.launchNuke(new RoomPosition(25, 25, 'W2N1')), C.ERR_NOT_ENOUGH_RESOURCES);
		});
	}));

	test('launchNuke validates plain object as ERR_INVALID_ARGS', () => sim(async ({ player }) => {
		await player('100', Game => {
			const nuker = lookForStructures(Game.rooms.W1N1, C.STRUCTURE_NUKER)[0]!;
			const target = { x: 25, y: 25, roomName: 'W2N1' } as unknown as RoomPosition;
			assert.strictEqual(nuker.launchNuke(target), C.ERR_INVALID_ARGS);
		});
	}));

	const impact = simulate({
		W1N1: room => {
			room['#insertObject'](createLoadedNuker(new RoomPosition(25, 25, 'W1N1')));
			room['#level'] = 8;
			room['#user'] =
				room.controller!['#user'] = '100';
		},
		W2N1: room => {
			const rampart = createRampart(new RoomPosition(25, 25, 'W2N1'), '101');
			rampart.hits = C.NUKE_DAMAGE[0] - 25;
			const wall = createWall(new RoomPosition(25, 25, 'W2N1'));
			wall.hits = 100;
			room['#insertObject'](rampart);
			room['#insertObject'](wall);
			room['#insertObject'](createCreep(new RoomPosition(24, 25, 'W2N1'), [ C.MOVE ], 'target', '101'));
			room['#insertObject'](createConstructionSite(
				new RoomPosition(30, 30, 'W2N1'),
				C.STRUCTURE_ROAD,
				'101',
				C.CONSTRUCTION_COST.road,
			));
			room['#insertObject'](createResource(new RoomPosition(31, 30, 'W2N1'), C.RESOURCE_ENERGY, 100));
			room['#insertObject'](createTestTombstone(new RoomPosition(32, 30, 'W2N1')));
			const ruinedWall = createWall(new RoomPosition(33, 30, 'W2N1'));
			ruinedWall.room = room;
			room['#insertObject'](createRuin(ruinedWall));
			room['#insertObject'](createSpawn(new RoomPosition(10, 10, 'W2N1'), '101', 'Spawn1'));
			room['#level'] = 8;
			room['#safeModeUntil'] = 100;
			room['#user'] = room.controller!['#user'] = '101';
			room.controller!['#safeModeCooldownTime'] = 100;
		},
	});

	test('nuke impact applies cleanup and damage at landTime', () => impact(async ({ player, tick, poke }) => {
		await player('100', Game => {
			const nuker = lookForStructures(Game.rooms.W1N1, C.STRUCTURE_NUKER)[0]!;
			assert.strictEqual(nuker.launchNuke(new RoomPosition(25, 25, 'W2N1')), C.OK);
		});
		await player('101', Game => {
			assert.strictEqual(Game.spawns.Spawn1?.spawnCreep([ C.MOVE ], 'spawning'), C.OK);
		});
		await tick();
		const rampartId = await poke('W2N1', '101', (Game, room) => {
			const nuke = room['#lookFor'](C.LOOK_NUKES)[0]!;
			nuke['#landTime'] = Game.time + 1;
			return lookForStructures(room, C.STRUCTURE_RAMPART)[0]!.id;
		});
		await tick();
		await player('101', Game => {
			const room = Game.rooms.W2N1!;
			assert.strictEqual(room['#lookFor'](C.LOOK_NUKES).length, 1);
			assert.strictEqual(room['#lookFor'](C.LOOK_CREEPS).length, 0);
			assert.strictEqual(room['#lookFor'](C.LOOK_TOMBSTONES).length, 0);
			assert.strictEqual(room['#lookFor'](C.LOOK_CONSTRUCTION_SITES).length, 0);
			assert.strictEqual(room['#lookFor'](C.LOOK_RESOURCES).length, 0);
			assert.strictEqual(room['#lookFor'](C.LOOK_RUINS).length, 0);
			assert.strictEqual(Game.spawns.Spawn1?.spawning, null);
			assert.strictEqual(room.controller?.safeMode, undefined);
			assert.strictEqual(room.controller?.safeModeCooldown, undefined);
			assert.strictEqual(room.controller?.upgradeBlocked, C.CONTROLLER_NUKE_BLOCKED_UPGRADE);

			const wall = lookForStructures(room, C.STRUCTURE_WALL)[0]!;
			assert.strictEqual(wall.hits, 75);

			const log = room.getEventLog();
			const destroyedIndex = log.findIndex(event =>
				event.event === C.EVENT_OBJECT_DESTROYED && event.objectId === rampartId);
			const attackIndex = log.findIndex(event =>
				event.event === C.EVENT_ATTACK && event.data?.targetId === rampartId);
			assert.ok(destroyedIndex >= 0, 'expected destroyed event for rampart');
			assert.ok(attackIndex >= 0, 'expected attack event for rampart');
			assert.ok(destroyedIndex < attackIndex, 'destroyed event should be recorded before attack');
		});
	}));

	const doubleImpact = simulate({
		W2N1: room => {
			const rampart = createRampart(new RoomPosition(25, 25, 'W2N1'), '101');
			rampart.hits = 1;
			const wall = createWall(new RoomPosition(25, 25, 'W2N1'));
			wall.hits = C.NUKE_DAMAGE[0] * 2 + 5;
			room['#insertObject'](rampart);
			room['#insertObject'](wall);
			room['#insertObject'](createCreep(new RoomPosition(20, 20, 'W2N1'), [ C.MOVE ], 'target', '101'));
			room['#level'] = 8;
			room['#user'] = room.controller!['#user'] = '101';
		},
	});

	test('same-tick multiple nuke impacts do not reuse queued removals', () => doubleImpact(async ({ player, tick, poke }) => {
		const creepId = await poke('W2N1', '101', (Game, room) => {
			room['#insertObject'](createNuke(new RoomPosition(25, 25, 'W2N1'), 'W1N1', Game.time + 1));
			room['#insertObject'](createNuke(new RoomPosition(25, 25, 'W2N1'), 'W1N1', Game.time + 1));
			return Game.creeps.target?.id;
		});
		await tick();
		await player('101', Game => {
			const room = Game.rooms.W2N1!;
			assert.strictEqual(lookForStructures(room, C.STRUCTURE_RAMPART).length, 0);
			assert.strictEqual(lookForStructures(room, C.STRUCTURE_WALL)[0]?.hits, 6);
			const destroyedEvents = room.getEventLog().filter(event =>
				event.event === C.EVENT_OBJECT_DESTROYED && event.objectId === creepId);
			assert.strictEqual(destroyedEvents.length, 1);
		});
	}));
});
