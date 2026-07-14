import * as User from 'xxscreeps/engine/db/user/index.js';
import * as C from 'xxscreeps/game/constants/index.js';
import { RoomPosition } from 'xxscreeps/game/position.js';
import { create as createCreep } from 'xxscreeps/mods/classic/creep/creep.js';
import { lookForStructures } from 'xxscreeps/mods/classic/structure/structure.js';
import { assert, describe, simulate, test } from 'xxscreeps/test/index.js';
import { create as createPowerSpawn } from './powerspawn.js';

const owner = '100';
const hostile = '101';

describe('PowerSpawn', () => {
	const sim = simulate({
		W1N1: room => {
			const powerSpawn = createPowerSpawn(new RoomPosition(25, 25, 'W1N1'), owner);
			powerSpawn.store['#add'](C.RESOURCE_ENERGY, C.POWER_SPAWN_ENERGY_CAPACITY);
			powerSpawn.store['#add'](C.RESOURCE_POWER, C.POWER_SPAWN_POWER_CAPACITY);
			room['#insertObject'](powerSpawn);
			room['#level'] = 8;
			room['#user'] = room.controller!['#user'] = owner;
		},
	});

	test('store capacity is per-resource', () => sim(async ({ player }) => {
		await player(owner, Game => {
			const powerSpawn = lookForStructures(Game.rooms.W1N1, C.STRUCTURE_POWER_SPAWN)[0]!;
			assert.strictEqual(powerSpawn.store.getCapacity(C.RESOURCE_ENERGY), C.POWER_SPAWN_ENERGY_CAPACITY);
			assert.strictEqual(powerSpawn.store.getCapacity(C.RESOURCE_POWER), C.POWER_SPAWN_POWER_CAPACITY);
			assert.strictEqual(powerSpawn.store.getCapacity(C.RESOURCE_OXYGEN), null);
			assert.strictEqual(powerSpawn.store.getFreeCapacity(C.RESOURCE_ENERGY), 0);
			assert.strictEqual(powerSpawn.power, C.POWER_SPAWN_POWER_CAPACITY);
			assert.strictEqual(powerSpawn.energy, C.POWER_SPAWN_ENERGY_CAPACITY);
		});
	}));

	test('processPower burns 1 power + POWER_SPAWN_ENERGY_RATIO energy and credits power XP', () => sim(async ({ player, shard, tick }) => {
		await player(owner, Game => {
			const powerSpawn = lookForStructures(Game.rooms.W1N1, C.STRUCTURE_POWER_SPAWN)[0]!;
			assert.strictEqual(powerSpawn.processPower(), C.OK);
		});
		await tick();
		await player(owner, Game => {
			const powerSpawn = lookForStructures(Game.rooms.W1N1, C.STRUCTURE_POWER_SPAWN)[0]!;
			assert.strictEqual(powerSpawn.power, C.POWER_SPAWN_POWER_CAPACITY - 1);
			assert.strictEqual(powerSpawn.energy, C.POWER_SPAWN_ENERGY_CAPACITY - C.POWER_SPAWN_ENERGY_RATIO);
		});
		assert.strictEqual(Number(await shard.db.data.hGet(User.infoKey(owner), 'power')), 1);
	}));

	test('processPower returns ERR_NOT_ENOUGH_RESOURCES without power', () => sim(async ({ player, poke }) => {
		await poke('W1N1', owner, Game => {
			const powerSpawn = lookForStructures(Game.rooms.W1N1, C.STRUCTURE_POWER_SPAWN)[0]!;
			powerSpawn.store['#subtract'](C.RESOURCE_POWER, C.POWER_SPAWN_POWER_CAPACITY);
		});
		await player(owner, Game => {
			const powerSpawn = lookForStructures(Game.rooms.W1N1, C.STRUCTURE_POWER_SPAWN)[0]!;
			assert.strictEqual(powerSpawn.processPower(), C.ERR_NOT_ENOUGH_RESOURCES);
		});
	}));

	test('processPower returns ERR_NOT_ENOUGH_RESOURCES below the energy ratio', () => sim(async ({ player, poke }) => {
		await poke('W1N1', owner, Game => {
			const powerSpawn = lookForStructures(Game.rooms.W1N1, C.STRUCTURE_POWER_SPAWN)[0]!;
			powerSpawn.store['#subtract'](C.RESOURCE_ENERGY, C.POWER_SPAWN_ENERGY_CAPACITY - (C.POWER_SPAWN_ENERGY_RATIO - 1));
		});
		await player(owner, Game => {
			const powerSpawn = lookForStructures(Game.rooms.W1N1, C.STRUCTURE_POWER_SPAWN)[0]!;
			assert.strictEqual(powerSpawn.energy, C.POWER_SPAWN_ENERGY_RATIO - 1);
			assert.strictEqual(powerSpawn.processPower(), C.ERR_NOT_ENOUGH_RESOURCES);
		});
	}));

	test('processPower returns ERR_NOT_OWNER for a structure you do not own', () => sim(async ({ player, poke }) => {
		await poke('W1N1', hostile, (Game, room) => {
			room['#insertObject'](createCreep(new RoomPosition(25, 24, 'W1N1'), [ C.MOVE ], 'raider', hostile));
		});
		await player(hostile, Game => {
			const powerSpawn = lookForStructures(Game.rooms.W1N1, C.STRUCTURE_POWER_SPAWN)[0]!;
			assert.strictEqual(powerSpawn.processPower(), C.ERR_NOT_OWNER);
		});
	}));
});
