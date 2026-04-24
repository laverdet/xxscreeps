import type { StructureExtension } from './extension.js';
import * as C from 'xxscreeps/game/constants/index.js';
import { RoomPosition } from 'xxscreeps/game/position.js';
import { Creep, create as createCreep } from 'xxscreeps/mods/creep/creep.js';
import { lookForStructures } from 'xxscreeps/mods/structure/structure.js';
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

	test('spawn direction', () => simulation(async ({ player, tick }) => {
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

	test('set direction', () => simulation(async ({ player, tick }) => {
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

	test('cancel spawn', () => simulation(async ({ player, tick }) => {
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

	test('spawn energy structures', () => simulation(async ({ player, tick, peekRoom }) => {
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

	test('renew energy structures', () => simulation(async ({ player, tick, peekRoom, poke }) => {
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

	test('renewCreep undefined', () => simulation(async ({ player }) => {
		await player('100', Game => {
			assert.strictEqual(Game.spawns.Spawn1.renewCreep(undefined as any), C.ERR_INVALID_TARGET);
		});
	}));

	test('recycleCreep undefined', () => simulation(async ({ player }) => {
		await player('100', Game => {
			assert.strictEqual(Game.spawns.Spawn1.recycleCreep(undefined as any), C.ERR_INVALID_TARGET);
		});
	}));

	test('destroy + unclaim', () => simulation(async ({ player, tick }) => {
		await player('100', Game => {
			assert.strictEqual(Game.spawns.Spawn1.spawnCreep([ C.MOVE ], 'creep'), C.OK);
			assert.strictEqual(Game.spawns.Spawn1.destroy(), C.OK);
			assert.strictEqual(Game.rooms.W1N1.controller!.unclaim(), C.OK);
		});
		await tick();
		await player('100', Game => {
			// This might fail in the future if we change room visibility rules in the tests, since the
			// player controls no intent objects
			assert.ok(!Game.spawns.Spawn1);
			assert.strictEqual(Game.rooms.W1N1.find(C.FIND_MY_CREEPS).length, 0);
			assert.ok(!Game.rooms.W1N1.controller?.my);
		});
	}));

	describe('spawn stomping', () => {
		// Spawn at (25,25), surrounded by hostile creeps on all 8 tiles
		const surrounded = simulate({
			W1N1: room => {
				room['#insertObject'](create(new RoomPosition(25, 25, 'W1N1'), '100', 'Spawn1'));
				room['#level'] = 8;
				room['#user'] = room.controller!['#user'] = '100';
				room['#insertObject'](createCreep(new RoomPosition(24, 24, 'W1N1'), [ C.MOVE ], 'h1', '101'));
				room['#insertObject'](createCreep(new RoomPosition(25, 24, 'W1N1'), [ C.MOVE ], 'h2', '101'));
				room['#insertObject'](createCreep(new RoomPosition(26, 24, 'W1N1'), [ C.MOVE ], 'h3', '101'));
				room['#insertObject'](createCreep(new RoomPosition(24, 25, 'W1N1'), [ C.MOVE ], 'h4', '101'));
				room['#insertObject'](createCreep(new RoomPosition(26, 25, 'W1N1'), [ C.MOVE ], 'h5', '101'));
				room['#insertObject'](createCreep(new RoomPosition(24, 26, 'W1N1'), [ C.MOVE ], 'h6', '101'));
				room['#insertObject'](createCreep(new RoomPosition(25, 26, 'W1N1'), [ C.MOVE ], 'h7', '101'));
				room['#insertObject'](createCreep(new RoomPosition(26, 26, 'W1N1'), [ C.MOVE ], 'h8', '101'));
			},
		});

		test('stomp hostile when fully surrounded', () => surrounded(async ({ player, tick }) => {
			await player('100', Game => {
				assert.strictEqual(Game.spawns.Spawn1.spawnCreep([ C.MOVE ], 'newCreep'), C.OK);
			});
			await tick(C.CREEP_SPAWN_TIME);
			await player('100', Game => {
				assert.ok(Game.creeps.newCreep);
				assert.ok(!Game.creeps.newCreep.spawning);
				// Should spawn at TOP (25,24) — first direction in default order
				assert.ok(Game.creeps.newCreep.pos.isEqualTo(25, 24));
				assert.strictEqual(Game.rooms.W1N1.find(C.FIND_TOMBSTONES).length, 1);
			});
			await player('101', Game => {
				// h2 at TOP (25,24) should be stomped — first hostile in direction order
				assert.strictEqual(Object.values(Game.creeps).length, 7);
				assert.ok(!Game.creeps.h2);
			});
		}));

		// Preferred direction TOP blocked by hostile, but other directions open
		const partialBlock = simulate({
			W1N1: room => {
				room['#insertObject'](create(new RoomPosition(25, 25, 'W1N1'), '100', 'Spawn1'));
				room['#level'] = 8;
				room['#user'] = room.controller!['#user'] = '100';
				room['#insertObject'](createCreep(new RoomPosition(25, 24, 'W1N1'), [ C.MOVE ], 'hostile', '101'));
			},
		});

		test('no stomp when non-preferred directions are open', () => partialBlock(async ({ player, tick }) => {
			await player('100', Game => {
				assert.strictEqual(Game.spawns.Spawn1.spawnCreep([ C.MOVE ], 'newCreep', {
					directions: [ C.TOP ],
				}), C.OK);
			});
			await tick(C.CREEP_SPAWN_TIME);
			await player('101', Game => {
				assert.ok(Game.creeps.hostile);
			});
			await player('100', Game => {
				assert.ok(Game.spawns.Spawn1.spawning);
				assert.strictEqual(Game.rooms.W1N1.find(C.FIND_TOMBSTONES).length, 0);
			});
		}));

		// Surrounded by own creeps — no stomp target
		const ownCreeps = simulate({
			W1N1: room => {
				room['#insertObject'](create(new RoomPosition(25, 25, 'W1N1'), '100', 'Spawn1'));
				room['#level'] = 8;
				room['#user'] = room.controller!['#user'] = '100';
				room['#insertObject'](createCreep(new RoomPosition(24, 24, 'W1N1'), [ C.MOVE ], 'f1', '100'));
				room['#insertObject'](createCreep(new RoomPosition(25, 24, 'W1N1'), [ C.MOVE ], 'f2', '100'));
				room['#insertObject'](createCreep(new RoomPosition(26, 24, 'W1N1'), [ C.MOVE ], 'f3', '100'));
				room['#insertObject'](createCreep(new RoomPosition(24, 25, 'W1N1'), [ C.MOVE ], 'f4', '100'));
				room['#insertObject'](createCreep(new RoomPosition(26, 25, 'W1N1'), [ C.MOVE ], 'f5', '100'));
				room['#insertObject'](createCreep(new RoomPosition(24, 26, 'W1N1'), [ C.MOVE ], 'f6', '100'));
				room['#insertObject'](createCreep(new RoomPosition(25, 26, 'W1N1'), [ C.MOVE ], 'f7', '100'));
				room['#insertObject'](createCreep(new RoomPosition(26, 26, 'W1N1'), [ C.MOVE ], 'f8', '100'));
			},
		});

		test('no stomp when surrounded by own creeps', () => ownCreeps(async ({ player, tick }) => {
			await player('100', Game => {
				assert.strictEqual(Game.spawns.Spawn1.spawnCreep([ C.MOVE ], 'newCreep'), C.OK);
			});
			await tick(C.CREEP_SPAWN_TIME);
			await player('100', Game => {
				// Spawn deferred — no hostile to stomp
				assert.ok(Game.spawns.Spawn1.spawning);
				// No tombstones — nobody died
				assert.strictEqual(Game.rooms.W1N1.find(C.FIND_TOMBSTONES).length, 0);
			});
		}));

		// 7 tiles blocked by own creeps, 1 by hostile — stomp the hostile
		const mixedBlock = simulate({
			W1N1: room => {
				room['#insertObject'](create(new RoomPosition(25, 25, 'W1N1'), '100', 'Spawn1'));
				room['#level'] = 8;
				room['#user'] = room.controller!['#user'] = '100';
				room['#insertObject'](createCreep(new RoomPosition(24, 24, 'W1N1'), [ C.MOVE ], 'f1', '100'));
				room['#insertObject'](createCreep(new RoomPosition(25, 24, 'W1N1'), [ C.MOVE ], 'f2', '100'));
				room['#insertObject'](createCreep(new RoomPosition(26, 24, 'W1N1'), [ C.MOVE ], 'f3', '100'));
				room['#insertObject'](createCreep(new RoomPosition(24, 25, 'W1N1'), [ C.MOVE ], 'f4', '100'));
				room['#insertObject'](createCreep(new RoomPosition(26, 25, 'W1N1'), [ C.MOVE ], 'f5', '100'));
				room['#insertObject'](createCreep(new RoomPosition(24, 26, 'W1N1'), [ C.MOVE ], 'f6', '100'));
				room['#insertObject'](createCreep(new RoomPosition(25, 26, 'W1N1'), [ C.MOVE ], 'f7', '100'));
				room['#insertObject'](createCreep(new RoomPosition(26, 26, 'W1N1'), [ C.MOVE ], 'hostile', '101'));
			},
		});

		test('stomp hostile when all tiles blocked and one is hostile', () => mixedBlock(async ({ player, tick }) => {
			await player('100', Game => {
				assert.strictEqual(Game.spawns.Spawn1.spawnCreep([ C.MOVE ], 'newCreep'), C.OK);
			});
			await tick(C.CREEP_SPAWN_TIME);
			await player('101', Game => {
				assert.strictEqual(Object.values(Game.creeps).length, 0);
			});
			await player('100', Game => {
				assert.ok(Game.creeps.newCreep);
				assert.ok(!Game.creeps.newCreep.spawning);
				assert.ok(Game.creeps.newCreep.pos.isEqualTo(26, 26));
				assert.strictEqual(Game.rooms.W1N1.find(C.FIND_TOMBSTONES).length, 1);
			});
		}));
	});
});

describe('Spawn isActive', () => {
	const excessSpawnSim = simulate({
		W3N1: room => {
			room['#insertObject'](create(new RoomPosition(20, 25, 'W3N1'), '100', 'SpawnA'));
			room['#insertObject'](create(new RoomPosition(25, 25, 'W3N1'), '100', 'SpawnB'));
			room['#level'] = 1;
			room['#user'] = room.controller!['#user'] = '100';
		},
	});

	test('excess spawns at RCL 1 — one inactive', () => excessSpawnSim(async ({ player }) => {
		await player('100', Game => {
			const spawns = lookForStructures(Game.rooms.W3N1, C.STRUCTURE_SPAWN);
			assert.strictEqual(spawns.length, 2, 'should have 2 spawns');
			const activeCount = spawns.filter(spawn => spawn.isActive()).length;
			assert.strictEqual(activeCount, 1, 'exactly 1 spawn should be active at RCL 1');
		});
	}));

	test('inactive spawn returns ERR_RCL_NOT_ENOUGH', () => excessSpawnSim(async ({ player }) => {
		await player('100', Game => {
			const spawns = lookForStructures(Game.rooms.W3N1, C.STRUCTURE_SPAWN);
			const inactive = spawns.find(spawn => !spawn.isActive())!;
			assert.ok(inactive, 'should find an inactive spawn');
			assert.strictEqual(inactive.spawnCreep([ C.MOVE ], 'test'), C.ERR_RCL_NOT_ENOUGH);
		});
	}));

	test('inactive spawn can still be destroyed', () => excessSpawnSim(async ({ player }) => {
		await player('100', Game => {
			const spawns = lookForStructures(Game.rooms.W3N1, C.STRUCTURE_SPAWN);
			const inactive = spawns.find(spawn => !spawn.isActive())!;
			assert.ok(inactive, 'should find an inactive spawn');
			assert.strictEqual(inactive.destroy(), C.OK, 'inactive structures should be destroyable');
		});
	}));

	const energySim = simulate({
		W3N1: room => {
			room['#insertObject'](create(new RoomPosition(25, 25, 'W3N1'), '100', 'Spawn1'));
			// Extension at RCL 1 should be inactive (extensions available from RCL 2)
			const ext = createExtension(new RoomPosition(25, 27, 'W3N1'), 1, '100');
			ext.store['#add'](C.RESOURCE_ENERGY, 50);
			room['#insertObject'](ext);
			room['#level'] = 1;
			room['#user'] = room.controller!['#user'] = '100';
		},
	});

	test('energyAvailable excludes inactive extensions', () => energySim(async ({ player }) => {
		await player('100', Game => {
			const ext = lookForStructures(Game.rooms.W3N1, C.STRUCTURE_EXTENSION)[0];
			assert.strictEqual(ext.isActive(), false, 'extension should be inactive at RCL 1');
			assert.strictEqual(Game.rooms.W3N1.energyAvailable, C.SPAWN_ENERGY_START,
				'energyAvailable should exclude inactive extension');
		});
	}));

	const transferSim = simulate({
		W3N1: room => {
			room['#insertObject'](create(new RoomPosition(25, 25, 'W3N1'), '100', 'Spawn1'));
			const ext = createExtension(new RoomPosition(25, 27, 'W3N1'), 1, '100');
			ext.store['#add'](C.RESOURCE_ENERGY, 10);
			room['#insertObject'](ext);
			const creep = createCreep(new RoomPosition(25, 26, 'W3N1'), [ C.CARRY, C.MOVE ], 'worker', '100');
			creep.store['#add'](C.RESOURCE_ENERGY, 10);
			room['#insertObject'](creep);
			room['#level'] = 1;
			room['#user'] = room.controller!['#user'] = '100';
		},
	});

	test('stores on inactive buildings still work — transfer', () => transferSim(async ({ player }) => {
		await player('100', Game => {
			const ext = lookForStructures(Game.rooms.W3N1, C.STRUCTURE_EXTENSION)[0];
			assert.strictEqual(ext.isActive(), false);
			assert.strictEqual(Game.creeps.worker.transfer(ext, C.RESOURCE_ENERGY, 1), C.OK);
		});
	}));

	test('stores on inactive buildings still work — withdraw', () => transferSim(async ({ player }) => {
		await player('100', Game => {
			const ext = lookForStructures(Game.rooms.W3N1, C.STRUCTURE_EXTENSION)[0];
			assert.strictEqual(ext.isActive(), false);
			assert.strictEqual(Game.creeps.worker.withdraw(ext, C.RESOURCE_ENERGY, 1), C.OK);
		});
	}));
});
