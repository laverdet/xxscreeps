import type { StructureExtension } from './extension.js';
import C from 'xxscreeps/game/constants/index.js';
import { RoomPosition } from 'xxscreeps/game/position.js';
import { Creep } from 'xxscreeps/mods/creep/creep.js';
import { assert, describe, simulate, test } from 'xxscreeps/test/index.js';
import { create as createExtension } from './extension.js';
import { create } from './spawn.js';

describe('Spawn', () => {
	const simulation = simulate({
		W1N1: room => {
			room['#insertObject'](create(new RoomPosition(25, 25, 'W1N1'), '100', 'Spawn1'));
			const extension = createExtension(new RoomPosition(25, 27, 'W1N1'), 8, '100');
			extension.store['#add'](C.RESOURCE_ENERGY, extension.store.getCapacity(C.RESOURCE_ENERGY));
			room['#insertObject'](extension);
			const extension2 = createExtension(new RoomPosition(25, 28, 'W1N1'), 8, '100');
			extension2.store['#add'](C.RESOURCE_ENERGY, extension.store.getCapacity(C.RESOURCE_ENERGY));
			room['#insertObject'](extension2);
			room['#level'] = 8;
			room['#user'] =
			room.controller!['#user'] = '100';
		},
	});

	test('spawn direction', () => simulation(async({ player, tick }) => {
		await player('100', Game => {
			Game.spawns.Spawn1.spawnCreep([ C.MOVE ], 'creep', {
				directions: [ C.RIGHT ],
			});
		});
		await tick(3);
		await player('100', Game => {
			assert.ok(Game.creeps.creep.pos.isEqualTo(26, 25));
		});
	}));

	test('set direction', () => simulation(async({ player, tick }) => {
		await player('100', Game => {
			Game.spawns.Spawn1.spawnCreep([ C.MOVE ], 'creep');
		});
		await tick();
		await player('100', Game => {
			Game.spawns.Spawn1.spawning?.setDirections([ C.BOTTOM ]);
		});
		await tick(2);
		await player('100', Game => {
			assert.ok(Game.creeps.creep.pos.isEqualTo(25, 26));
		});
	}));

	test('cancel spawn', () => simulation(async({ player, tick }) => {
		await player('100', Game => {
			Game.spawns.Spawn1.spawnCreep([ C.MOVE ], 'creep');
		});
		await tick();
		await player('100', Game => {
			Game.spawns.Spawn1.spawning!.cancel();
		});
		await tick();
		await player('100', Game => {
			assert.ok(!Game.spawns.spawning);
			assert.strictEqual(Game.rooms.W1N1['#objects'].some(object => object instanceof Creep), false);
		});
	}));

	test('spawn energy structures', () => simulation(async({ player, tick, peekRoom }) => {
		const extensionId = await peekRoom('W1N1', room => room.lookForAt(C.LOOK_STRUCTURES, 25, 27)[0].id);
		await player('100', Game => {
			Game.spawns.Spawn1.spawnCreep([ C.MOVE ], 'creep', {
				energyStructures: [ Game.getObjectById(extensionId)! ],
			});
		});
		await tick();
		await player('100', Game => {
			assert.strictEqual(Game.spawns.Spawn1.store[C.RESOURCE_ENERGY], C.SPAWN_ENERGY_START);
			assert.strictEqual(Game.getObjectById<StructureExtension>(extensionId)!.store[C.RESOURCE_ENERGY],
				C.EXTENSION_ENERGY_CAPACITY[8] - C.BODYPART_COST[C.MOVE]);
		});
	}));

	test('renew energy structures', () => simulation(async({ player, tick, peekRoom, poke }) => {
		const extensionId = await peekRoom('W1N1', room => room.lookForAt(C.LOOK_STRUCTURES, 25, 27)[0].id);
		await player('100', Game => {
			Game.spawns.Spawn1.spawnCreep([ C.MOVE, C.MOVE, C.MOVE, C.MOVE, C.MOVE ], 'creep');
		});
		await tick(5 * C.CREEP_SPAWN_TIME);
		await poke('W1N1', '100', Game => {
			const spawn = Game.spawns.Spawn1;
			spawn.store['#subtract']('energy', spawn.store[C.RESOURCE_ENERGY] - 1);
			Game.creeps.creep['#ageTime'] = Game.time + 1;
		});
		await player('100', Game => {
			assert.strictEqual(Game.spawns.Spawn1.renewCreep(Game.creeps.creep), C.OK);
		});
		await tick();
		await player('100', Game => {
			assert.strictEqual(Game.spawns.Spawn1.store[C.RESOURCE_ENERGY], 0);
			// 300 starting, 120 cost, +1 from the spawn = 181
			assert.strictEqual(Game.getObjectById<StructureExtension>(extensionId)!.store[C.RESOURCE_ENERGY], 181);
		});
	}));

	test('destroy + unclaim', () => simulation(async({ player, tick }) => {
		await player('100', Game => {
			assert.strictEqual(Game.spawns.Spawn1.spawnCreep([ C.MOVE ], 'creep'), C.OK);
			assert.strictEqual(Game.spawns.Spawn1.destroy(), C.OK);
			assert.strictEqual(Game.rooms.W1N1.controller!.unclaim(), C.OK);
		});
		await tick();
		await player('100', Game => {
			// This might fail in the future if we change room visibility rules in the tests, since the
			// player controls no intent objects
			assert(!Game.spawns.Spawn1);
			assert.strictEqual(Game.rooms.W1N1.find(C.FIND_MY_CREEPS).length, 0);
			assert(!Game.rooms.W1N1.controller?.my);
		});
	}));
});
