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
				room['#user'] = room.controller!['#user'] = '100';
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
				// recipe.cooldown is 20; observable cooldown is recipe.cooldown - 1
				// (processor write at gameTime = T, user read at runtimeData.time = T+1).
				assert.strictEqual(factory.cooldown, 19);
			});
		}));

		const decompressSim = simulate({
			W1N1: room => {
				room['#insertObject'](createFactoryWithResources(
					new RoomPosition(25, 25, 'W1N1'), '100',
					{ [C.RESOURCE_UTRIUM_BAR]: 100, [C.RESOURCE_ENERGY]: 200 }));
				room['#level'] = 7;
				room['#user'] = room.controller!['#user'] = '100';
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
				// See `produce bar from mineral` above for the `-1` rationale.
				assert.strictEqual(factory.cooldown, 19);
			});
		}));

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
				room['#user'] = room.controller!['#user'] = '100';
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
				room['#user'] = room.controller!['#user'] = '100';
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
				room['#user'] = room.controller!['#user'] = '100';
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
				room['#user'] = room.controller!['#user'] = '100';
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
				room['#user'] = room.controller!['#user'] = '100';
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
				room['#user'] = room.controller!['#user'] = '100';
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
	// integration
	// =========================================================================
	describe('integration', () => {
		const integrationSim = simulate({
			W1N1: room => {
				room['#insertObject'](createFactory(new RoomPosition(25, 25, 'W1N1'), '100'));
				room['#level'] = 7;
				room['#user'] = room.controller!['#user'] = '100';
			},
		});

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

	});
});
