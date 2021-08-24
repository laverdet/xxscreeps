import type { StructureExtension } from './extension';
import * as C from 'xxscreeps/game/constants';
import { RoomPosition } from 'xxscreeps/game/position';
import { Creep } from 'xxscreeps/mods/creep/creep';
import { assert, describe, simulate, test } from 'xxscreeps/test';
import { create as createExtension } from './extension';
import { create } from './spawn';

describe('Spawn', () => {
	const simulation = simulate({
		W1N1: room => {
			room['#insertObject'](create(new RoomPosition(25, 25, 'W1N1'), '100', 'Spawn1'));
			const extension = createExtension(new RoomPosition(25, 27, 'W1N1'), 1, '100');
			extension.store['#add'](C.RESOURCE_ENERGY, 50);
			room['#insertObject'](extension);
			room['#level'] = 1;
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
		const id = await peekRoom('W1N1', room => room.lookForAt(C.LOOK_STRUCTURES, 25, 27)[0].id);
		await player('100', Game => {
			Game.spawns.Spawn1.spawnCreep([ C.MOVE ], 'creep', {
				energyStructures: [ Game.getObjectById(id)! ],
			});
		});
		await tick();
		await player('100', Game => {
			assert.strictEqual(Game.spawns.Spawn1.store[C.RESOURCE_ENERGY], C.SPAWN_ENERGY_START);
			assert.strictEqual(Game.getObjectById<StructureExtension>(id)!.store[C.RESOURCE_ENERGY],
				C.EXTENSION_ENERGY_CAPACITY[1] - C.BODYPART_COST[C.MOVE]);
		});
	}));

	test('renew energy structures', () => simulation(async({ player, tick, peekRoom, pokeRoom }) => {
		// This is a pretty lousy test. I think the simulation should have more than 300 energy to avoid
		// the free energy per tick and make expected values easier to test.
		await player('100', Game => {
			Game.spawns.Spawn1.spawnCreep([ C.MOVE, C.MOVE, C.MOVE, C.MOVE, C.MOVE ], 'creep');
		});
		await tick(5 * C.CREEP_SPAWN_TIME);
		await pokeRoom('W1N1', (room, Game) => {
			room.find(C.FIND_CREEPS)[0]['#ageTime'] = Game.time + 1;
		});
		for (let ii = 0; ii < 3; ++ii) {
			await player('100', Game => {
				assert.strictEqual(Game.spawns.Spawn1.renewCreep(Game.creeps.creep), C.OK);
			});
			await tick();
		}
		await peekRoom('W1N1', room => {
			assert.strictEqual(room.find(C.FIND_CREEPS)[0].ticksToLive, 358);
			assert.strictEqual(room.energyAvailable, 58);
		});
	}));
});
