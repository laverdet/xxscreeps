import * as C from 'xxscreeps/game/constants/index.js';
import { RoomPosition } from 'xxscreeps/game/position.js';
import { lookForStructures } from 'xxscreeps/mods/structure/structure.js';
import { assert, describe, simulate, test } from 'xxscreeps/test/index.js';
import { create as createNuker } from './nuker.js';

describe('Nuker', () => {
	const sim = simulate({
		W1N1: room => {
			const nuker = createNuker(new RoomPosition(25, 25, 'W1N1'), '100');
			nuker.store['#add'](C.RESOURCE_ENERGY, C.NUKER_ENERGY_CAPACITY);
			nuker.store['#add'](C.RESOURCE_GHODIUM, C.NUKER_GHODIUM_CAPACITY);
			room['#insertObject'](nuker);
			room['#level'] = 8;
			room['#user'] =
				room.controller!['#user'] = '100';
		},
		W2N1: room => {
			room['#level'] = 1;
			room['#user'] =
				room.controller!['#user'] = '200';
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
	}));

	test('launchNuke validates plain object as ERR_INVALID_ARGS', () => sim(async ({ player }) => {
		await player('100', Game => {
			const nuker = lookForStructures(Game.rooms.W1N1, C.STRUCTURE_NUKER)[0]!;
			const target = { x: 25, y: 25, roomName: 'W2N1' } as unknown as RoomPosition;
			assert.strictEqual(nuker.launchNuke(target), C.ERR_INVALID_ARGS);
		});
	}));
});
