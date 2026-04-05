import type { Room } from 'xxscreeps/game/room/index.js';
import type { ResourceType } from 'xxscreeps/mods/resource/index.js';
import * as C from 'xxscreeps/game/constants/index.js';
import { RoomPosition } from 'xxscreeps/game/position.js';
import { lookForStructures } from 'xxscreeps/mods/structure/structure.js';
import { assert, describe, simulate, test } from 'xxscreeps/test/index.js';
import { create as createFactory } from './factory.js';

function createFactoryWithResources(pos: RoomPosition, owner: string, resources: Partial<Record<ResourceType, number>>) {
	const factory = createFactory(pos, owner);
	for (const [ type, amount ] of Object.entries(resources)) {
		factory.store['#add'](type as ResourceType, amount);
	}
	return factory;
}

function getFactory(game: { rooms: Record<string, Room> }) {
	return lookForStructures(game.rooms.W1N1, C.STRUCTURE_FACTORY)[0];
}

describe('Factory', () => {

	// =========================================================================
	// produce — core mechanics
	// =========================================================================
	describe('produce', () => {
		const produceSim = simulate({
			W1N1: room => {
				room['#insertObject'](createFactoryWithResources(
					new RoomPosition(25, 25, 'W1N1'), '100',
					{ [C.RESOURCE_UTRIUM]: 500, [C.RESOURCE_ENERGY]: 200 }));
				room['#level'] = 7;
				room['#user'] =
					room.controller!['#user'] = '100';
			},
		});

		test('produce bar from mineral', () => produceSim(async ({ player, tick }) => {
			await player('100', Game => {
				const factory = getFactory(Game);
				assert.strictEqual(factory.produce(C.RESOURCE_UTRIUM_BAR), C.OK);
			});
			await tick();
			await player('100', Game => {
				const factory = getFactory(Game);
				assert.strictEqual(factory.store[C.RESOURCE_UTRIUM_BAR], 100);
				assert.strictEqual(factory.store[C.RESOURCE_UTRIUM], 0);
				assert.strictEqual(factory.store[C.RESOURCE_ENERGY], 0);
				assert.strictEqual(factory.cooldown, 20);
			});
		}));

		const decompressSim = simulate({
			W1N1: room => {
				room['#insertObject'](createFactoryWithResources(
					new RoomPosition(25, 25, 'W1N1'), '100',
					{ [C.RESOURCE_UTRIUM_BAR]: 100, [C.RESOURCE_ENERGY]: 200 }));
				room['#level'] = 7;
				room['#user'] =
					room.controller!['#user'] = '100';
			},
		});

		test('decompress bar to mineral', () => decompressSim(async ({ player, tick }) => {
			await player('100', Game => {
				const factory = getFactory(Game);
				assert.strictEqual(factory.produce(C.RESOURCE_UTRIUM), C.OK);
			});
			await tick();
			await player('100', Game => {
				const factory = getFactory(Game);
				assert.strictEqual(factory.store[C.RESOURCE_UTRIUM], 500);
				assert.strictEqual(factory.store[C.RESOURCE_UTRIUM_BAR], 0);
				assert.strictEqual(factory.store[C.RESOURCE_ENERGY], 0);
				assert.strictEqual(factory.cooldown, 20);
			});
		}));

		// Guards against drift in the recipe table extracted from
		// game/constants/resource.ts into mods/factory/constants.ts. Any typo
		// in component amounts, cooldown, or level gating fails here. Tests 1
		// and 2 above cover the end-to-end produce pipeline for compression
		// and decompression; this test covers every recipe's data.
		test('commodity recipes match fixture', () => {
			const barPair = (mineral: string, barResource: string) => ({
				[barResource]: { amount: 100, cooldown: 20, components: { [mineral]: 500, [C.RESOURCE_ENERGY]: 200 } },
				[mineral]: { amount: 500, cooldown: 20, components: { [barResource]: 100, [C.RESOURCE_ENERGY]: 200 } },
			});
			assert.deepStrictEqual(C.COMMODITIES, {
				// Bars (any factory level, symmetric compression/decompression)
				...barPair(C.RESOURCE_UTRIUM, C.RESOURCE_UTRIUM_BAR),
				...barPair(C.RESOURCE_LEMERGIUM, C.RESOURCE_LEMERGIUM_BAR),
				...barPair(C.RESOURCE_ZYNTHIUM, C.RESOURCE_ZYNTHIUM_BAR),
				...barPair(C.RESOURCE_KEANIUM, C.RESOURCE_KEANIUM_BAR),
				...barPair(C.RESOURCE_GHODIUM, C.RESOURCE_GHODIUM_MELT),
				...barPair(C.RESOURCE_OXYGEN, C.RESOURCE_OXIDANT),
				...barPair(C.RESOURCE_HYDROGEN, C.RESOURCE_REDUCTANT),
				...barPair(C.RESOURCE_CATALYST, C.RESOURCE_PURIFIER),

				// Battery (any factory level)
				[C.RESOURCE_BATTERY]: { amount: 50, cooldown: 10, components: { [C.RESOURCE_ENERGY]: 600 } },
				[C.RESOURCE_ENERGY]: { amount: 500, cooldown: 10, components: { [C.RESOURCE_BATTERY]: 50 } },

				// Composites
				[C.RESOURCE_COMPOSITE]: { level: 1, amount: 20, cooldown: 50, components: { [C.RESOURCE_UTRIUM_BAR]: 20, [C.RESOURCE_ZYNTHIUM_BAR]: 20, [C.RESOURCE_ENERGY]: 20 } },
				[C.RESOURCE_CRYSTAL]: { level: 2, amount: 6, cooldown: 21, components: { [C.RESOURCE_LEMERGIUM_BAR]: 6, [C.RESOURCE_KEANIUM_BAR]: 6, [C.RESOURCE_PURIFIER]: 6, [C.RESOURCE_ENERGY]: 45 } },
				[C.RESOURCE_LIQUID]: { level: 3, amount: 12, cooldown: 60, components: { [C.RESOURCE_OXIDANT]: 12, [C.RESOURCE_REDUCTANT]: 12, [C.RESOURCE_GHODIUM_MELT]: 12, [C.RESOURCE_ENERGY]: 90 } },

				// Electronics
				[C.RESOURCE_WIRE]: { amount: 20, cooldown: 8, components: { [C.RESOURCE_UTRIUM_BAR]: 20, [C.RESOURCE_SILICON]: 100, [C.RESOURCE_ENERGY]: 40 } },
				[C.RESOURCE_SWITCH]: { level: 1, amount: 5, cooldown: 70, components: { [C.RESOURCE_WIRE]: 40, [C.RESOURCE_OXIDANT]: 95, [C.RESOURCE_UTRIUM_BAR]: 35, [C.RESOURCE_ENERGY]: 20 } },
				[C.RESOURCE_TRANSISTOR]: { level: 2, amount: 1, cooldown: 59, components: { [C.RESOURCE_SWITCH]: 4, [C.RESOURCE_WIRE]: 15, [C.RESOURCE_REDUCTANT]: 85, [C.RESOURCE_ENERGY]: 8 } },
				[C.RESOURCE_MICROCHIP]: { level: 3, amount: 1, cooldown: 250, components: { [C.RESOURCE_TRANSISTOR]: 2, [C.RESOURCE_COMPOSITE]: 50, [C.RESOURCE_WIRE]: 117, [C.RESOURCE_PURIFIER]: 25, [C.RESOURCE_ENERGY]: 16 } },
				[C.RESOURCE_CIRCUIT]: { level: 4, amount: 1, cooldown: 800, components: { [C.RESOURCE_MICROCHIP]: 1, [C.RESOURCE_TRANSISTOR]: 5, [C.RESOURCE_SWITCH]: 4, [C.RESOURCE_OXIDANT]: 115, [C.RESOURCE_ENERGY]: 32 } },
				[C.RESOURCE_DEVICE]: { level: 5, amount: 1, cooldown: 600, components: { [C.RESOURCE_CIRCUIT]: 1, [C.RESOURCE_MICROCHIP]: 3, [C.RESOURCE_CRYSTAL]: 110, [C.RESOURCE_GHODIUM_MELT]: 150, [C.RESOURCE_ENERGY]: 64 } },

				// Biology
				[C.RESOURCE_CELL]: { amount: 20, cooldown: 8, components: { [C.RESOURCE_LEMERGIUM_BAR]: 20, [C.RESOURCE_BIOMASS]: 100, [C.RESOURCE_ENERGY]: 40 } },
				[C.RESOURCE_PHLEGM]: { level: 1, amount: 2, cooldown: 35, components: { [C.RESOURCE_CELL]: 20, [C.RESOURCE_OXIDANT]: 36, [C.RESOURCE_LEMERGIUM_BAR]: 16, [C.RESOURCE_ENERGY]: 8 } },
				[C.RESOURCE_TISSUE]: { level: 2, amount: 2, cooldown: 164, components: { [C.RESOURCE_PHLEGM]: 10, [C.RESOURCE_CELL]: 10, [C.RESOURCE_REDUCTANT]: 110, [C.RESOURCE_ENERGY]: 16 } },
				[C.RESOURCE_MUSCLE]: { level: 3, amount: 1, cooldown: 250, components: { [C.RESOURCE_TISSUE]: 3, [C.RESOURCE_PHLEGM]: 3, [C.RESOURCE_ZYNTHIUM_BAR]: 50, [C.RESOURCE_REDUCTANT]: 50, [C.RESOURCE_ENERGY]: 16 } },
				[C.RESOURCE_ORGANOID]: { level: 4, amount: 1, cooldown: 800, components: { [C.RESOURCE_MUSCLE]: 1, [C.RESOURCE_TISSUE]: 5, [C.RESOURCE_PURIFIER]: 208, [C.RESOURCE_OXIDANT]: 256, [C.RESOURCE_ENERGY]: 32 } },
				[C.RESOURCE_ORGANISM]: { level: 5, amount: 1, cooldown: 600, components: { [C.RESOURCE_ORGANOID]: 1, [C.RESOURCE_LIQUID]: 150, [C.RESOURCE_TISSUE]: 6, [C.RESOURCE_CELL]: 310, [C.RESOURCE_ENERGY]: 64 } },

				// Mechanics
				[C.RESOURCE_ALLOY]: { amount: 20, cooldown: 8, components: { [C.RESOURCE_ZYNTHIUM_BAR]: 20, [C.RESOURCE_METAL]: 100, [C.RESOURCE_ENERGY]: 40 } },
				[C.RESOURCE_TUBE]: { level: 1, amount: 2, cooldown: 45, components: { [C.RESOURCE_ALLOY]: 40, [C.RESOURCE_ZYNTHIUM_BAR]: 16, [C.RESOURCE_ENERGY]: 8 } },
				[C.RESOURCE_FIXTURES]: { level: 2, amount: 1, cooldown: 115, components: { [C.RESOURCE_COMPOSITE]: 20, [C.RESOURCE_ALLOY]: 41, [C.RESOURCE_OXIDANT]: 161, [C.RESOURCE_ENERGY]: 8 } },
				[C.RESOURCE_FRAME]: { level: 3, amount: 1, cooldown: 125, components: { [C.RESOURCE_FIXTURES]: 2, [C.RESOURCE_TUBE]: 4, [C.RESOURCE_REDUCTANT]: 330, [C.RESOURCE_ZYNTHIUM_BAR]: 31, [C.RESOURCE_ENERGY]: 16 } },
				[C.RESOURCE_HYDRAULICS]: { level: 4, amount: 1, cooldown: 800, components: { [C.RESOURCE_LIQUID]: 150, [C.RESOURCE_FIXTURES]: 3, [C.RESOURCE_TUBE]: 15, [C.RESOURCE_PURIFIER]: 208, [C.RESOURCE_ENERGY]: 32 } },
				[C.RESOURCE_MACHINE]: { level: 5, amount: 1, cooldown: 600, components: { [C.RESOURCE_HYDRAULICS]: 1, [C.RESOURCE_FRAME]: 2, [C.RESOURCE_FIXTURES]: 3, [C.RESOURCE_TUBE]: 12, [C.RESOURCE_ENERGY]: 64 } },

				// Alchemy
				[C.RESOURCE_CONDENSATE]: { amount: 20, cooldown: 8, components: { [C.RESOURCE_KEANIUM_BAR]: 20, [C.RESOURCE_MIST]: 100, [C.RESOURCE_ENERGY]: 40 } },
				[C.RESOURCE_CONCENTRATE]: { level: 1, amount: 3, cooldown: 41, components: { [C.RESOURCE_CONDENSATE]: 30, [C.RESOURCE_KEANIUM_BAR]: 15, [C.RESOURCE_REDUCTANT]: 54, [C.RESOURCE_ENERGY]: 12 } },
				[C.RESOURCE_EXTRACT]: { level: 2, amount: 2, cooldown: 128, components: { [C.RESOURCE_CONCENTRATE]: 10, [C.RESOURCE_CONDENSATE]: 30, [C.RESOURCE_OXIDANT]: 60, [C.RESOURCE_ENERGY]: 16 } },
				[C.RESOURCE_SPIRIT]: { level: 3, amount: 1, cooldown: 200, components: { [C.RESOURCE_EXTRACT]: 2, [C.RESOURCE_CONCENTRATE]: 6, [C.RESOURCE_REDUCTANT]: 90, [C.RESOURCE_PURIFIER]: 20, [C.RESOURCE_ENERGY]: 16 } },
				[C.RESOURCE_EMANATION]: { level: 4, amount: 1, cooldown: 800, components: { [C.RESOURCE_SPIRIT]: 2, [C.RESOURCE_EXTRACT]: 2, [C.RESOURCE_CONCENTRATE]: 3, [C.RESOURCE_KEANIUM_BAR]: 112, [C.RESOURCE_ENERGY]: 32 } },
				[C.RESOURCE_ESSENCE]: { level: 5, amount: 1, cooldown: 600, components: { [C.RESOURCE_EMANATION]: 1, [C.RESOURCE_SPIRIT]: 3, [C.RESOURCE_CRYSTAL]: 110, [C.RESOURCE_GHODIUM_MELT]: 150, [C.RESOURCE_ENERGY]: 64 } },
			});
		});
	});

	// =========================================================================
	// produce — error cases
	// =========================================================================
	describe('produce errors', () => {
		const errorSim = simulate({
			W1N1: room => {
				room['#insertObject'](createFactoryWithResources(
					new RoomPosition(25, 25, 'W1N1'), '100',
					{ [C.RESOURCE_UTRIUM]: 1000, [C.RESOURCE_ENERGY]: 1000 }));
				room['#level'] = 7;
				room['#user'] =
					room.controller!['#user'] = '100';
			},
		});

		test('cooldown blocks produce', () => errorSim(async ({ player, tick }) => {
			await player('100', Game => {
				const factory = getFactory(Game);
				factory.produce(C.RESOURCE_UTRIUM_BAR);
			});
			await tick();
			await player('100', Game => {
				const factory = getFactory(Game);
				assert.strictEqual(factory.produce(C.RESOURCE_UTRIUM_BAR), C.ERR_TIRED);
			});
		}));

		const emptySim = simulate({
			W1N1: room => {
				room['#insertObject'](createFactory(new RoomPosition(25, 25, 'W1N1'), '100'));
				room['#level'] = 7;
				room['#user'] =
					room.controller!['#user'] = '100';
			},
		});

		test('missing components', () => emptySim(async ({ player }) => {
			await player('100', Game => {
				const factory = getFactory(Game);
				assert.strictEqual(factory.produce(C.RESOURCE_UTRIUM_BAR), C.ERR_NOT_ENOUGH_RESOURCES);
			});
		}));

		const fullSim = simulate({
			W1N1: room => {
				// Nearly full: only 1 free capacity unit
				room['#insertObject'](createFactoryWithResources(
					new RoomPosition(25, 25, 'W1N1'), '100',
					{
						[C.RESOURCE_ENERGY]: 600,
						[C.RESOURCE_UTRIUM]: C.FACTORY_CAPACITY - 601,
					}));
				room['#level'] = 7;
				room['#user'] =
					room.controller!['#user'] = '100';
			},
		});

		test('net-negative recipe succeeds near capacity', () => fullSim(async ({ player, tick }) => {
			await player('100', Game => {
				const factory = getFactory(Game);
				// Battery: consumes 600 energy, produces 50 battery. Net = -550, always fits.
				assert.strictEqual(factory.produce(C.RESOURCE_BATTERY), C.OK);
			});
			await tick();
			await player('100', Game => {
				const factory = getFactory(Game);
				assert.strictEqual(factory.store[C.RESOURCE_BATTERY], 50);
				assert.strictEqual(factory.store[C.RESOURCE_ENERGY], 0);
			});
		}));

		const overflowSim = simulate({
			W1N1: room => {
				// Decompression (bar → mineral) is net-positive: 100 bar + 200 energy → 500 mineral (+200 net)
				// Fill store so free capacity < 200 to trigger ERR_FULL
				room['#insertObject'](createFactoryWithResources(
					new RoomPosition(25, 25, 'W1N1'), '100',
					{
						[C.RESOURCE_UTRIUM_BAR]: 100,
						[C.RESOURCE_ENERGY]: 200,
						[C.RESOURCE_ZYNTHIUM]: C.FACTORY_CAPACITY - 300 - 100,
					}));
				room['#level'] = 7;
				room['#user'] =
					room.controller!['#user'] = '100';
			},
		});

		test('store full rejects net-positive recipe', () => overflowSim(async ({ player }) => {
			await player('100', Game => {
				const factory = getFactory(Game);
				// 100 bar + 200 energy → 500 utrium. Net = +200. Free capacity = 100. Should fail.
				assert.strictEqual(factory.produce(C.RESOURCE_UTRIUM), C.ERR_FULL);
			});
		}));

		test('level restriction', () => emptySim(async ({ player }) => {
			await player('100', Game => {
				const factory = getFactory(Game);
				// composite requires level 1
				assert.strictEqual(factory.produce(C.RESOURCE_COMPOSITE), C.ERR_INVALID_TARGET);
			});
		}));

		const leveledSim = simulate({
			W1N1: room => {
				const factory = createFactoryWithResources(
					new RoomPosition(25, 25, 'W1N1'), '100',
					{
						[C.RESOURCE_UTRIUM_BAR]: 20,
						[C.RESOURCE_ZYNTHIUM_BAR]: 20,
						[C.RESOURCE_ENERGY]: 20,
					});
				factory['#level'] = 1;
				room['#insertObject'](factory);
				room['#level'] = 7;
				room['#user'] =
					room.controller!['#user'] = '100';
			},
		});

		test('leveled factory produces matching recipe', () => leveledSim(async ({ player, tick }) => {
			await player('100', Game => {
				const factory = getFactory(Game);
				assert.strictEqual(factory.level, 1);
				assert.strictEqual(factory.produce(C.RESOURCE_COMPOSITE), C.OK);
			});
			await tick();
			await player('100', Game => {
				const factory = getFactory(Game);
				assert.strictEqual(factory.store[C.RESOURCE_COMPOSITE], 20);
				assert.strictEqual(factory.store[C.RESOURCE_UTRIUM_BAR], 0);
				assert.strictEqual(factory.store[C.RESOURCE_ZYNTHIUM_BAR], 0);
				assert.strictEqual(factory.store[C.RESOURCE_ENERGY], 0);
			});
		}));

		test('leveled factory rejects wrong level', () => leveledSim(async ({ player }) => {
			await player('100', Game => {
				const factory = getFactory(Game);
				// crystal requires level 2, factory is level 1
				assert.strictEqual(factory.produce(C.RESOURCE_CRYSTAL), C.ERR_INVALID_TARGET);
			});
		}));

		test('invalid resource type', () => emptySim(async ({ player }) => {
			await player('100', Game => {
				const factory = getFactory(Game);
				// silicon is a deposit resource with no commodity recipe
				assert.strictEqual(factory.produce(C.RESOURCE_SILICON as ResourceType), C.ERR_INVALID_ARGS);
			});
		}));

		const lowRclSim = simulate({
			W1N1: room => {
				room['#insertObject'](createFactoryWithResources(
					new RoomPosition(25, 25, 'W1N1'), '100',
					{ [C.RESOURCE_UTRIUM]: 500, [C.RESOURCE_ENERGY]: 200 }));
				room['#level'] = 6;
				room['#user'] =
					room.controller!['#user'] = '100';
			},
		});

		test('inactive factory at low RCL', () => lowRclSim(async ({ player }) => {
			await player('100', Game => {
				const factory = getFactory(Game);
				assert.strictEqual(factory.produce(C.RESOURCE_UTRIUM_BAR), C.ERR_RCL_NOT_ENOUGH);
			});
		}));
	});

	// =========================================================================
	// room accessor and creep interaction
	// =========================================================================
	describe('integration', () => {
		const integrationSim = simulate({
			W1N1: room => {
				room['#insertObject'](createFactory(new RoomPosition(25, 25, 'W1N1'), '100'));
				room['#level'] = 7;
				room['#user'] =
					room.controller!['#user'] = '100';
			},
		});

		test('room.factory accessor', () => integrationSim(async ({ player }) => {
			await player('100', Game => {
				const room = Game.rooms.W1N1;
				assert.ok(room.factory, 'room.factory should be defined');
				assert.strictEqual(room.factory.structureType, C.STRUCTURE_FACTORY);
			});
		}));

		test('store capacity', () => integrationSim(async ({ player }) => {
			await player('100', Game => {
				assert.strictEqual(getFactory(Game).store.getCapacity(), C.FACTORY_CAPACITY);
			});
		}));

		test('unleveled factory has level undefined', () => integrationSim(async ({ player }) => {
			await player('100', Game => {
				const factory = getFactory(Game);
				assert.strictEqual(factory.level, undefined);
			});
		}));

		test('destroy clears room.factory', () => integrationSim(async ({ player, tick }) => {
			await player('100', Game => {
				const factory = getFactory(Game);
				assert.strictEqual(factory.destroy(), C.OK);
			});
			await tick();
			await player('100', Game => {
				assert.strictEqual(Game.rooms.W1N1.factory, undefined);
				assert.strictEqual(lookForStructures(Game.rooms.W1N1, C.STRUCTURE_FACTORY).length, 0);
			});
		}));
	});
});
