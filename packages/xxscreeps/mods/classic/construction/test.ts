import type { ConstructibleStructureType } from './construction-site.js';
import type { Room } from 'xxscreeps/game/room/index.js';
import type { StructureExtension } from 'xxscreeps/mods/classic/spawn/extension.js';
import { RoomPosition } from 'xxscreeps/game/position.js';
import { create as createCreep } from 'xxscreeps/mods/classic/creep/creep.js';
import { create as createContainer } from 'xxscreeps/mods/classic/resource/container.js';
import { create as createRoad } from 'xxscreeps/mods/classic/road/road.js';
import { create as createExtension } from 'xxscreeps/mods/classic/spawn/extension.js';
import { create as createSpawn } from 'xxscreeps/mods/classic/spawn/spawn.js';
import { createRuin } from 'xxscreeps/mods/classic/structure/ruin.js';
import { lookForStructures } from 'xxscreeps/mods/classic/structure/structure.js';
import { assert, describe, simulate, test } from 'xxscreeps/test/index.js';
import * as C from 'xxscreeps:mods/constants';
import { create as createSite } from './construction-site.js';

describe('mods/classic/construction', () => {
	describe('createConstructionSite', () => {
		const construction = simulate({
			W1N1: room => {
				room['#level'] = 8;
				room['#user'] = room.controller!['#user'] = '100';
			},
		});

		test('create site', () => construction(async ({ player, tick }) => {
			await player('100', Game => {
				Game.rooms.W1N1?.createConstructionSite(25, 25, 'road');
			});
			await tick();
			await player('100', Game => {
				// Should create a site
				assert.ok(Object.values(Game.constructionSites).length === 1);
			});
		}));
		test('max construction sites', () => construction(async ({ player, tick }) => {
			// Place most sites in tick 1
			const firstBatch = C.MAX_CONSTRUCTION_SITES - 10;
			await player('100', Game => {
				for (let pos = 0; pos < firstBatch; ++pos) {
					const xx = 1 + (pos % 48);
					const yy = 1 + Math.floor(pos / 48);
					assert.strictEqual(Game.rooms.W1N1?.createConstructionSite(xx, yy, 'road'), C.OK);
				}
			});
			await tick();
			// Try 11 more in tick 2 — first 10 should succeed, 11th should fail
			await player('100', Game => {
				assert.strictEqual(Object.keys(Game.constructionSites).length, firstBatch);
				for (let pos = firstBatch; pos < C.MAX_CONSTRUCTION_SITES; ++pos) {
					const xx = 1 + (pos % 48);
					const yy = 1 + Math.floor(pos / 48);
					assert.strictEqual(Game.rooms.W1N1?.createConstructionSite(xx, yy, 'road'), C.OK);
				}
				assert.strictEqual(Game.rooms.W1N1?.createConstructionSite(1, 4, 'road'), C.ERR_FULL);
				// Remove one site, then creating should succeed again
				Object.values(Game.constructionSites)[0]?.remove();
			});
			await tick();
			await player('100', Game => {
				assert.strictEqual(Object.keys(Game.constructionSites).length, C.MAX_CONSTRUCTION_SITES - 1);
				assert.strictEqual(Game.rooms.W1N1?.createConstructionSite(1, 4, 'road'), C.OK);
			});
		}));

		test('two sites at same position', () => construction(async ({ player, tick }) => {
			await player('100', Game => {
				Game.rooms.W1N1?.createConstructionSite(25, 25, 'road');
				Game.rooms.W1N1?.createConstructionSite(25, 25, 'rampart');
			});
			await tick();
			await player('100', Game => {
				assert.ok(
					// Only the first command should create a site
					Object.values(Game.constructionSites).length === 1 &&
	                Object.values(Game.constructionSites)[0]?.structureType === 'road',
				);
			});
		}));

		test('site on ruin with same structure type', () => {
			const ruin = simulate({
				W1N1: room => {
					room['#level'] = 8;
					room['#user'] = room.controller!['#user'] = '100';
					room['#insertObject'](createRuin(createContainer(new RoomPosition(25, 25, 'W1N1'))));
				},
			});
			return ruin(async ({ player, tick }) => {
				await player('100', Game => {
					assert.strictEqual(Game.rooms.W1N1?.lookForAt(C.LOOK_RUINS, 25, 25).length, 1);
					assert.strictEqual(Game.rooms.W1N1.createConstructionSite(25, 25, C.STRUCTURE_CONTAINER), C.OK);
				});
				await tick();
				await player('100', Game => {
					assert.strictEqual(Game.rooms.W1N1?.lookForAt(C.LOOK_RUINS, 25, 25).length, 1);
					const site = Object.values(Game.constructionSites)[0];
					assert.ok(site);
					assert.strictEqual(site.structureType, C.STRUCTURE_CONTAINER);
					assert.ok(site.pos.isEqualTo(25, 25));
				});
			});
		});

		// W1N1 (shard.json) at y=7: x=5 is plain, x=15 is wall, x=20 is swamp.
		test('road site progressTotal scales by terrain', () => construction(async ({ player, tick }) => {
			await player('100', Game => {
				assert.strictEqual(Game.rooms.W1N1?.createConstructionSite(5, 7, 'road'), C.OK);
				assert.strictEqual(Game.rooms.W1N1.createConstructionSite(20, 7, 'road'), C.OK);
				assert.strictEqual(Game.rooms.W1N1.createConstructionSite(15, 7, 'road'), C.OK);
			});
			await tick();
			await player('100', Game => {
				const sitesByPos = new Map(Object.values(Game.constructionSites).map(site => [ `${site.pos.x},${site.pos.y}`, site ]));
				assert.strictEqual(sitesByPos.get('5,7')!.progressTotal, C.CONSTRUCTION_COST.road);
				assert.strictEqual(sitesByPos.get('20,7')!.progressTotal, C.CONSTRUCTION_COST.road * C.CONSTRUCTION_COST_ROAD_SWAMP_RATIO);
				assert.strictEqual(sitesByPos.get('15,7')!.progressTotal, C.CONSTRUCTION_COST.road * C.CONSTRUCTION_COST_ROAD_WALL_RATIO);
			});
		}));
	});

	describe('intent precedence', () => {
		const fillSites = (room: Room, owner: string, count: number) => {
			for (let ii = 0; ii < count; ++ii) {
				const xx = 1 + (ii % 48);
				const yy = 1 + Math.floor(ii / 48);
				room['#insertObject'](createSite(new RoomPosition(xx, yy, room.name), 'road', owner, C.CONSTRUCTION_COST.road));
			}
		};

		const rclCappedAndFull = simulate({
			W1N1: room => {
				room['#level'] = 1;
				room['#user'] = room.controller!['#user'] = '100';
				fillSites(room, '100', C.MAX_CONSTRUCTION_SITES);
			},
		});

		test('rcl or structure cap before site cap full', () => rclCappedAndFull(async ({ player }) => {
			await player('100', Game => {
				assert.strictEqual(Game.rooms.W1N1!.createConstructionSite(45, 45, 'tower'), C.ERR_RCL_NOT_ENOUGH);
			});
		}));

		const sameTypeAndFull = simulate({
			W1N1: room => {
				room['#level'] = 8;
				room['#user'] = room.controller!['#user'] = '100';
				room['#insertObject'](createSite(new RoomPosition(25, 25, 'W1N1'), 'road', '100', C.CONSTRUCTION_COST.road));
				fillSites(room, '100', C.MAX_CONSTRUCTION_SITES - 1);
			},
		});

		test('invalid target before site cap full', () => sameTypeAndFull(async ({ player }) => {
			await player('100', Game => {
				assert.strictEqual(Game.rooms.W1N1!.createConstructionSite(25, 25, 'road'), C.ERR_INVALID_TARGET);
			});
		}));

		const oversizedName = 'x'.repeat(101);
		const setupForeignRoom = (room: Room, level = 8) => {
			room['#level'] = level;
			room['#user'] = room.controller!['#user'] = '101';
			// Visiting creep so player '100' has vision into the room.
			room['#insertObject'](createCreep(new RoomPosition(20, 20, room.name), [ C.MOVE ], 'visitor', '100'));
		};

		const foreignOwned = simulate({
			W1N1: room => setupForeignRoom(room),
		});

		test('not owner', () => foreignOwned(async ({ player }) => {
			await player('100', Game => {
				assert.strictEqual(Game.rooms.W1N1!.createConstructionSite(25, 25, 'road'), C.ERR_NOT_OWNER);
			});
		}));

		const foreignOwnedRclCapped = simulate({
			W1N1: room => setupForeignRoom(room, 1),
		});

		test('not owner before rcl or structure cap', () => foreignOwnedRclCapped(async ({ player }) => {
			await player('100', Game => {
				assert.strictEqual(Game.rooms.W1N1!.createConstructionSite(25, 25, 'tower'), C.ERR_NOT_OWNER);
			});
		}));

		const foreignOwnedInvalidTarget = simulate({
			W1N1: room => {
				setupForeignRoom(room);
				room['#insertObject'](createSite(new RoomPosition(25, 25, 'W1N1'), 'road', '101', C.CONSTRUCTION_COST.road));
			},
		});

		test('not owner before invalid target', () => foreignOwnedInvalidTarget(async ({ player }) => {
			await player('100', Game => {
				assert.strictEqual(Game.rooms.W1N1!.createConstructionSite(25, 25, 'road'), C.ERR_NOT_OWNER);
			});
		}));

		const foreignReserved = simulate({
			W1N1: room => {
				room['#user'] = '101';
				room.controller!['#reservationEndTime'] = 100;
				room['#insertObject'](createCreep(new RoomPosition(20, 20, room.name), [ C.MOVE ], 'visitor', '100'));
			},
		});

		test('reserved not owner before rcl or structure cap', () => foreignReserved(async ({ player }) => {
			await player('100', Game => {
				assert.strictEqual(Game.rooms.W1N1!.createConstructionSite(25, 25, 'road'), C.ERR_NOT_OWNER);
				assert.strictEqual(Game.rooms.W1N1!.createConstructionSite(25, 25, 'tower'), C.ERR_NOT_OWNER);
			});
		}));

		const selfReserved = simulate({
			W1N1: room => {
				room['#user'] = '100';
				room.controller!['#reservationEndTime'] = 100;
				room['#insertObject'](createCreep(new RoomPosition(20, 20, room.name), [ C.MOVE ], 'visitor', '100'));
			},
		});

		test('reserved by self allowed', () => selfReserved(async ({ player }) => {
			await player('100', Game => {
				assert.strictEqual(Game.rooms.W1N1!.createConstructionSite(25, 25, 'road'), C.OK);
			});
		}));

		const foreignOwnedAndFull = simulate({
			W1N1: room => setupForeignRoom(room),
			W2N1: room => {
				room['#level'] = 8;
				room['#user'] = room.controller!['#user'] = '100';
				fillSites(room, '100', C.MAX_CONSTRUCTION_SITES);
			},
		});

		test('not owner before site cap full', () => foreignOwnedAndFull(async ({ player }) => {
			await player('100', Game => {
				assert.strictEqual(Game.rooms.W1N1!.createConstructionSite(25, 25, 'road'), C.ERR_NOT_OWNER);
			});
		}));

		const ownedRcl8 = simulate({
			W1N1: room => {
				room['#level'] = 8;
				room['#user'] = room.controller!['#user'] = '100';
			},
		});

		test('invalid args', () => ownedRcl8(async ({ player }) => {
			await player('100', Game => {
				assert.strictEqual(Game.rooms.W1N1!.createConstructionSite(25, 25, 'spawn', oversizedName), C.ERR_INVALID_ARGS);
			});
		}));

		test('invalid args before not owner', () => foreignOwned(async ({ player }) => {
			await player('100', Game => {
				assert.strictEqual(
					Game.rooms.W1N1!.createConstructionSite(25, 25, 'spawn', oversizedName),
					C.ERR_INVALID_ARGS,
				);
			});
		}));

		const ownedRcl1WithSpawn = simulate({
			W1N1: room => {
				room['#level'] = 1;
				room['#user'] = room.controller!['#user'] = '100';
				room['#insertObject'](createSpawn(new RoomPosition(24, 25, 'W1N1'), '100', 'Spawn1'));
			},
		});

		test('invalid args before rcl or structure cap', () => ownedRcl1WithSpawn(async ({ player }) => {
			await player('100', Game => {
				assert.strictEqual(Game.rooms.W1N1!.createConstructionSite(25, 25, 'spawn', oversizedName), C.ERR_INVALID_ARGS);
			});
		}));

		const ownedWithRoadSite = simulate({
			W1N1: room => {
				room['#level'] = 8;
				room['#user'] = room.controller!['#user'] = '100';
				room['#insertObject'](createSite(new RoomPosition(25, 25, 'W1N1'), 'road', '100', C.CONSTRUCTION_COST.road));
			},
		});

		test('invalid args before invalid target', () => ownedWithRoadSite(async ({ player }) => {
			await player('100', Game => {
				assert.strictEqual(Game.rooms.W1N1!.createConstructionSite(25, 25, 'spawn', oversizedName), C.ERR_INVALID_ARGS);
			});
		}));

		const ownedAndFull = simulate({
			W1N1: room => {
				room['#level'] = 8;
				room['#user'] = room.controller!['#user'] = '100';
				fillSites(room, '100', C.MAX_CONSTRUCTION_SITES);
			},
		});

		test('invalid args before site cap full', () => ownedAndFull(async ({ player }) => {
			await player('100', Game => {
				// (49, 49) is outside `fillSites`' (1,1)-(4,3) range, so any non-INVALID_ARGS slip-up
				// would fall through to the cap and surface ERR_FULL.
				assert.strictEqual(Game.rooms.W1N1!.createConstructionSite(49, 49, 'spawn', oversizedName), C.ERR_INVALID_ARGS);
			});
		}));
	});

	describe('stacking', () => {
		const overStructure = simulate({
			W1N1: room => {
				room['#level'] = 8;
				room['#user'] = room.controller!['#user'] = '100';
				room['#insertObject'](createContainer(new RoomPosition(25, 25, 'W1N1')));
				room['#insertObject'](createSpawn(new RoomPosition(26, 25, 'W1N1'), '100', 'Spawn1'));
				room['#insertObject'](createRoad(new RoomPosition(27, 25, 'W1N1')));
			},
		});

		test('non-road, non-rampart pair on the same tile is rejected', () => overStructure(async ({ player }) => {
			await player('100', Game => {
				assert.strictEqual(Game.rooms.W1N1?.createConstructionSite(25, 25, 'spawn', 'Spawn2'), C.ERR_INVALID_TARGET);
				assert.strictEqual(Game.rooms.W1N1.createConstructionSite(26, 25, 'container'), C.ERR_INVALID_TARGET);
			});
		}));

		test('road or rampart on either side allows stacking', () => overStructure(async ({ player }) => {
			await player('100', Game => {
				assert.strictEqual(Game.rooms.W1N1?.createConstructionSite(25, 25, 'road'), C.OK);
				assert.strictEqual(Game.rooms.W1N1.createConstructionSite(26, 25, 'rampart'), C.OK);
				assert.strictEqual(Game.rooms.W1N1.createConstructionSite(27, 25, 'container'), C.OK);
			});
		}));
	});

	describe('creep intent precedence', () => {
		const noEnergyWorker = simulate({
			W1N1: room => {
				room['#level'] = 8;
				room['#user'] = room.controller!['#user'] = '100';
				room['#insertObject'](createCreep(new RoomPosition(10, 10, 'W1N1'), [ C.WORK, C.CARRY ], 'worker', '100'));
			},
		});

		test('repair: not enough before invalid target', () => noEnergyWorker(async ({ player }) => {
			await player('100', Game => {
				assert.strictEqual(Game.creeps.worker!.repair(undefined as never), C.ERR_NOT_ENOUGH_RESOURCES);
			});
		}));

		test('build: not enough before invalid target', () => noEnergyWorker(async ({ player }) => {
			await player('100', Game => {
				assert.strictEqual(Game.creeps.worker!.build(undefined as never), C.ERR_NOT_ENOUGH_RESOURCES);
			});
		}));

		const noEnergyOutOfRange = simulate({
			W1N1: room => {
				room['#level'] = 8;
				room['#user'] = room.controller!['#user'] = '100';
				room['#insertObject'](createCreep(new RoomPosition(10, 10, 'W1N1'), [ C.WORK, C.CARRY ], 'worker', '100'));
				room['#insertObject'](createContainer(new RoomPosition(20, 20, 'W1N1')));
				room['#insertObject'](createSite(new RoomPosition(20, 21, 'W1N1'), 'road', '100', C.CONSTRUCTION_COST.road));
			},
		});

		test('repair: not enough before range', () => noEnergyOutOfRange(async ({ player }) => {
			await player('100', Game => {
				const container = lookForStructures(Game.rooms.W1N1, C.STRUCTURE_CONTAINER)[0]!;
				assert.strictEqual(Game.creeps.worker!.repair(container), C.ERR_NOT_ENOUGH_RESOURCES);
			});
		}));

		test('build: not enough before range', () => noEnergyOutOfRange(async ({ player }) => {
			await player('100', Game => {
				const site = Object.values(Game.constructionSites)[0]!;
				assert.strictEqual(Game.creeps.worker!.build(site), C.ERR_NOT_ENOUGH_RESOURCES);
			});
		}));

		const noEnergyBlockedTarget = simulate({
			W1N1: room => {
				room['#level'] = 8;
				room['#user'] = room.controller!['#user'] = '100';
				room['#insertObject'](createCreep(new RoomPosition(10, 10, 'W1N1'), [ C.WORK, C.CARRY ], 'builder', '100'));
				room['#insertObject'](createCreep(new RoomPosition(12, 10, 'W1N1'), [ C.MOVE ], 'blocker', '100'));
				room['#insertObject'](createSite(new RoomPosition(12, 10, 'W1N1'), C.STRUCTURE_EXTENSION, '100', C.CONSTRUCTION_COST.extension));
			},
		});

		test('build: not enough before blocked target', () => noEnergyBlockedTarget(async ({ player }) => {
			await player('100', Game => {
				const site = Object.values(Game.constructionSites)[0]!;
				assert.strictEqual(Game.creeps.builder!.build(site), C.ERR_NOT_ENOUGH_RESOURCES);
			});
		}));

		const blockedTargetOutOfRange = simulate({
			W1N1: room => {
				room['#level'] = 8;
				room['#user'] = room.controller!['#user'] = '100';
				const builder = createCreep(new RoomPosition(10, 10, 'W1N1'), [ C.WORK, C.CARRY ], 'builder', '100');
				builder.store['#add'](C.RESOURCE_ENERGY, 50);
				room['#insertObject'](builder);
				room['#insertObject'](createCreep(new RoomPosition(20, 20, 'W1N1'), [ C.MOVE ], 'blocker', '100'));
				room['#insertObject'](createSite(new RoomPosition(20, 20, 'W1N1'), C.STRUCTURE_EXTENSION, '100', C.CONSTRUCTION_COST.extension));
			},
		});

		test('build: range before blocked target', () => blockedTargetOutOfRange(async ({ player }) => {
			await player('100', Game => {
				const site = Object.values(Game.constructionSites)[0]!;
				assert.strictEqual(Game.creeps.builder!.build(site), C.ERR_NOT_IN_RANGE);
			});
		}));
	});

	describe('stomping', () => {
		const stomping = simulate({
			W1N1: room => {
				room['#level'] = 1;
				room['#user'] = room.controller!['#user'] = '100';
				// Enemy creep one tile above the construction site
				room['#insertObject'](createCreep(new RoomPosition(25, 24, 'W1N1'), [ C.MOVE ], 'enemy', '101'));
				// Owner's construction site with some progress
				const site = createSite(new RoomPosition(25, 25, 'W1N1'), 'road', '100', C.CONSTRUCTION_COST.road);
				site.progress = 200;
				room['#insertObject'](site);
			},
		});

		test('enemy creep destroys hostile construction site on move', () => stomping(async ({ player, tick }) => {
			await player('101', Game => {
				assert.strictEqual(Game.creeps.enemy?.move(C.BOTTOM), C.OK);
			});
			await tick();
			await player('101', Game => {
				// Creep should have moved
				assert.ok(Game.creeps.enemy?.pos.isEqualTo(25, 25));
			});
			await player('100', Game => {
				// Construction site should be destroyed
				assert.strictEqual(Object.values(Game.constructionSites).length, 0);
				// Half of progress should be dropped as energy at the site position (minus 1 tick of decay)
				const energy = Game.rooms.W1N1!.find(C.FIND_DROPPED_RESOURCES);
				assert.strictEqual(energy.length, 1);
				assert.ok(energy[0]?.pos.isEqualTo(25, 25));
				assert.strictEqual(energy[0]?.resourceType, C.RESOURCE_ENERGY);
				assert.strictEqual(energy[0].amount, 100 - Math.ceil(100 / C.ENERGY_DECAY));
			});
		}));

		const ownStomp = simulate({
			W1N1: room => {
				room['#level'] = 1;
				room['#user'] = room.controller!['#user'] = '100';
				room['#insertObject'](createCreep(new RoomPosition(25, 24, 'W1N1'), [ C.MOVE ], 'own', '100'));
				const site = createSite(new RoomPosition(25, 25, 'W1N1'), 'road', '100', C.CONSTRUCTION_COST.road);
				site.progress = 200;
				room['#insertObject'](site);
			},
		});

		test('own creep does not destroy own construction site', () => ownStomp(async ({ player, tick }) => {
			await player('100', Game => {
				assert.strictEqual(Game.creeps.own?.move(C.BOTTOM), C.OK);
			});
			await tick();
			await player('100', Game => {
				assert.ok(Game.creeps.own?.pos.isEqualTo(25, 25));
				assert.strictEqual(Object.values(Game.constructionSites).length, 1);
			});
		}));

		const zeroProgress = simulate({
			W1N1: room => {
				room['#level'] = 1;
				room['#user'] = room.controller!['#user'] = '100';
				room['#insertObject'](createCreep(new RoomPosition(25, 24, 'W1N1'), [ C.MOVE ], 'enemy', '101'));
				const site = createSite(new RoomPosition(25, 25, 'W1N1'), 'road', '100', C.CONSTRUCTION_COST.road);
				// progress defaults to 0
				room['#insertObject'](site);
			},
		});

		test('stomps site with no progress, drops no energy', () => zeroProgress(async ({ player, tick }) => {
			await player('101', Game => {
				assert.strictEqual(Game.creeps.enemy?.move(C.BOTTOM), C.OK);
			});
			await tick();
			await player('100', Game => {
				assert.strictEqual(Object.values(Game.constructionSites).length, 0);
				const energy = Game.rooms.W1N1!.find(C.FIND_DROPPED_RESOURCES);
				assert.strictEqual(energy.length, 0);
			});
		}));

		const stompingSafeMode = simulate({
			W1N1: room => {
				room['#level'] = 1;
				room['#user'] = room.controller!['#user'] = '100';
				room['#safeModeUntil'] = 100;
				room['#insertObject'](createCreep(new RoomPosition(25, 24, 'W1N1'), [ C.MOVE ], 'enemy', '101'));
				const site = createSite(new RoomPosition(25, 25, 'W1N1'), 'road', '100', C.CONSTRUCTION_COST.road);
				site.progress = 200;
				room['#insertObject'](site);
			},
		});

		test('safe mode prevents stomping', () => stompingSafeMode(async ({ player, tick }) => {
			await player('101', Game => {
				assert.strictEqual(Game.creeps.enemy?.move(C.BOTTOM), C.OK);
			});
			await tick();
			await player('101', Game => {
				// Creep should still move onto the tile
				assert.ok(Game.creeps.enemy?.pos.isEqualTo(25, 25));
			});
			await player('100', Game => {
				// Construction site should survive during safe mode
				assert.strictEqual(Object.values(Game.constructionSites).length, 1);
			});
		}));

		const noController = simulate({
			W0N0: room => {
				room['#insertObject'](createCreep(new RoomPosition(25, 24, 'W0N0'), [ C.MOVE ], 'enemy', '101'));
				const site = createSite(new RoomPosition(25, 25, 'W0N0'), 'road', '100', C.CONSTRUCTION_COST.road);
				site.progress = 100;
				room['#insertObject'](site);
			},
		});

		test('stomps in unowned room with no controller', () => noController(async ({ player, tick }) => {
			await player('101', Game => {
				assert.strictEqual(Game.creeps.enemy?.move(C.BOTTOM), C.OK);
			});
			await tick();
			await player('101', Game => {
				assert.ok(Game.creeps.enemy?.pos.isEqualTo(25, 25));
			});
			await player('100', Game => {
				assert.strictEqual(Object.values(Game.constructionSites).length, 0);
			});
		}));
	});

	describe('event log', () => {
		const buildSim = simulate({
			W1N1: room => {
				room['#level'] = 1;
				room['#user'] = room.controller!['#user'] = '100';
				const builder = createCreep(new RoomPosition(25, 25, 'W1N1'), [ C.WORK, C.CARRY ], 'builder', '100');
				builder.store['#add'](C.RESOURCE_ENERGY, 50);
				room['#insertObject'](builder);
				room['#insertObject'](createSite(new RoomPosition(26, 25, 'W1N1'), 'road', '100', C.CONSTRUCTION_COST.road));
			},
		});

		test('build emits EVENT_BUILD with amount and energySpent', () => buildSim(async ({ player, tick }) => {
			await player('100', Game => {
				const site = Object.values(Game.constructionSites)[0]!;
				assert.strictEqual(Game.creeps.builder?.build(site), C.OK);
			});
			await tick();
			await player('100', Game => {
				const log = Game.rooms.W1N1!.getEventLog();
				const build = log.find(entry => entry.event === C.EVENT_BUILD);
				assert.ok(build, 'expected EVENT_BUILD');
				assert.strictEqual(build.objectId, Game.creeps.builder?.id);
				assert.ok(build.data, 'expected nested data payload');
				assert.strictEqual(build.data.amount, C.BUILD_POWER);
				assert.strictEqual(build.data.energySpent, C.BUILD_POWER);
			});
		}));

		const repairSim = simulate({
			W1N1: room => {
				room['#level'] = 1;
				room['#user'] = room.controller!['#user'] = '100';
				const fixer = createCreep(new RoomPosition(25, 25, 'W1N1'), [ C.WORK, C.CARRY ], 'fixer', '100');
				fixer.store['#add'](C.RESOURCE_ENERGY, 50);
				room['#insertObject'](fixer);
				const container = createContainer(new RoomPosition(26, 25, 'W1N1'));
				container.hits = 100;
				room['#insertObject'](container);
			},
		});

		test('creep repair emits EVENT_REPAIR with amount and energySpent', () => repairSim(async ({ player, tick }) => {
			await player('100', Game => {
				const container = lookForStructures(Game.rooms.W1N1, C.STRUCTURE_CONTAINER)[0]!;
				assert.strictEqual(Game.creeps.fixer?.repair(container), C.OK);
			});
			await tick();
			await player('100', Game => {
				const log = Game.rooms.W1N1!.getEventLog();
				const repair = log.find(entry => entry.event === C.EVENT_REPAIR);
				assert.ok(repair, 'expected EVENT_REPAIR');
				assert.strictEqual(repair.objectId, Game.creeps.fixer?.id);
				assert.ok(repair.data, 'expected nested data payload');
				assert.strictEqual(repair.data.amount, C.REPAIR_POWER);
				assert.strictEqual(repair.data.energySpent, Math.ceil(C.REPAIR_COST));
			});
		}));

		// Dismantle reaches structure death via #applyDamage so EVENT_OBJECT_DESTROYED
		// fires from Structure's override; without that path the destroyed-event
		// would be silently dropped on dismantle-kills.
		const dismantleKill = simulate({
			W1N1: room => {
				room['#level'] = 1;
				room['#user'] = room.controller!['#user'] = '100';
				const dismantler = createCreep(new RoomPosition(25, 25, 'W1N1'), [ C.WORK, C.MOVE ], 'dismantler', '100');
				room['#insertObject'](dismantler);
				const container = createContainer(new RoomPosition(26, 25, 'W1N1'));
				container.hits = 10;
				room['#insertObject'](container);
			},
		});

		test('dismantle to death emits EVENT_OBJECT_DESTROYED with structureType', () => dismantleKill(async ({ player, tick }) => {
			await player('100', Game => {
				const container = lookForStructures(Game.rooms.W1N1, C.STRUCTURE_CONTAINER)[0]!;
				assert.strictEqual(Game.creeps.dismantler?.dismantle(container), C.OK);
			});
			await tick();
			await player('100', Game => {
				const log = Game.rooms.W1N1!.getEventLog();
				const destroyed = log.find(entry => entry.event === C.EVENT_OBJECT_DESTROYED);
				assert.ok(destroyed, 'expected EVENT_OBJECT_DESTROYED for dismantled structure');
				assert.ok(destroyed.data, 'expected nested data payload');
				assert.strictEqual(destroyed.data.type, C.STRUCTURE_CONTAINER);
			});
		}));
	});

	describe('dismantle', () => {
		const controllerSim = simulate({
			W1N1: room => {
				room['#level'] = 1;
				room['#user'] = room.controller!['#user'] = '100';
				const controllerPos = room.controller!.pos;
				room['#insertObject'](createCreep(new RoomPosition(controllerPos.x - 1, controllerPos.y, 'W1N1'), [ C.WORK ], 'near', '100'));
				room['#insertObject'](createCreep(new RoomPosition(1, 1, 'W1N1'), [ C.WORK ], 'far', '100'));
			},
		});

		test('controller is invalid target', () => controllerSim(async ({ player }) => {
			await player('100', Game => {
				const controller = Game.rooms.W1N1!.controller!;
				assert.strictEqual(Game.creeps.near?.dismantle(controller), C.ERR_INVALID_TARGET);
			});
		}));

		test('controller invalid target before range', () => controllerSim(async ({ player }) => {
			await player('100', Game => {
				const controller = Game.rooms.W1N1!.controller!;
				assert.strictEqual(Game.creeps.far?.dismantle(controller), C.ERR_INVALID_TARGET);
			});
		}));
	});

	describe('structure limits per RCL', () => {
		// The official per-RCL structure limits and extension capacity, extracted
		// by script (not by hand) from `@screeps/common/lib/constants.js`, the
		// package from which the constants published on docs.screeps.com are
		// rendered. Levels are the keys, as in the official table.
		const official: Record<string, Record<number, number>> = {
			spawn: { 0: 0, 1: 1, 2: 1, 3: 1, 4: 1, 5: 1, 6: 1, 7: 2, 8: 3 },
			extension: { 0: 0, 1: 0, 2: 5, 3: 10, 4: 20, 5: 30, 6: 40, 7: 50, 8: 60 },
			link: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 2, 6: 3, 7: 4, 8: 6 },
			road: { 0: 2500, 1: 2500, 2: 2500, 3: 2500, 4: 2500, 5: 2500, 6: 2500, 7: 2500, 8: 2500 },
			constructedWall: { 1: 0, 2: 2500, 3: 2500, 4: 2500, 5: 2500, 6: 2500, 7: 2500, 8: 2500 },
			rampart: { 1: 0, 2: 2500, 3: 2500, 4: 2500, 5: 2500, 6: 2500, 7: 2500, 8: 2500 },
			storage: { 1: 0, 2: 0, 3: 0, 4: 1, 5: 1, 6: 1, 7: 1, 8: 1 },
			tower: { 1: 0, 2: 0, 3: 1, 4: 1, 5: 2, 6: 2, 7: 3, 8: 6 },
			observer: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 1 },
			powerSpawn: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 1 },
			extractor: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 1, 7: 1, 8: 1 },
			terminal: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 1, 7: 1, 8: 1 },
			lab: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 3, 7: 6, 8: 10 },
			container: { 0: 5, 1: 5, 2: 5, 3: 5, 4: 5, 5: 5, 6: 5, 7: 5, 8: 5 },
			nuker: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 1 },
			factory: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 1, 8: 1 },
		};
		const officialExtensionCapacity: Record<number, number> = { 0: 50, 1: 50, 2: 50, 3: 50, 4: 50, 5: 50, 6: 50, 7: 100, 8: 200 };
		const levels = [ 0, 1, 2, 3, 4, 5, 6, 7, 8 ];

		test('CONTROLLER_STRUCTURES matches the official table', () => {
			const types = Object.keys(official) as (keyof typeof C.CONTROLLER_STRUCTURES)[];
			for (const type of types) {
				for (const level of levels) {
					const limit = official[type]?.[level];
					if (limit === undefined) {
						continue;
					}
					assert.strictEqual(
						C.CONTROLLER_STRUCTURES[type][level],
						limit,
						`${type} at RCL ${level}`,
					);
				}
			}
			for (const level of levels) {
				assert.strictEqual(
					C.EXTENSION_ENERGY_CAPACITY[level],
					officialExtensionCapacity[level],
					`extension capacity at RCL ${level}`,
				);
			}
		});

		// One owned room per RCL, shared by the tests for every structure type at
		// that level. Sites persist between tests, so the free-tile scan skips
		// tiles that are already occupied. The engine caps at every level for
		// every type should be exact, but the 2500-tile caps (road, wall, rampart)
		// are unreachable under MAX_CONSTRUCTION_SITES, so for these the probe is
		// buildability alone; their exact values are locked by the table test.
		const maxSmallCap = 60;
		for (let level = 1; level <= 8; ++level) {
			const atLevel = simulate({
				W1N1: room => {
					room['#level'] = level;
					room['#user'] = room.controller!['#user'] = '100';
				},
			});
			for (const type of Object.keys(official)) {
				test(`${type} at RCL ${level}`, () => atLevel(async ({ player, tick }) => {
					const cap = official[type]?.[level] ?? 0;

					// Room-edge tiles cannot be built on, and near-border tiles only
					// where the neighboring border is a natural wall; the scan starts
					// at 2 accordingly.
					const createUpTo = (batch: number, position?: [ number, number ]) => player('100', Game => {
						const view = Game.rooms.W1N1!;
						const terrain = Game.map.getRoomTerrain(view.name);
						const isFree = (xx: number, yy: number) =>
							terrain.get(xx, yy) !== C.TERRAIN_MASK_WALL &&
							view.lookForAt(C.LOOK_STRUCTURES, xx, yy).length === 0 &&
							view.lookForAt(C.LOOK_CONSTRUCTION_SITES, xx, yy).length === 0 &&
							view.lookForAt(C.LOOK_RUINS, xx, yy).length === 0;
						let created = 0;
						for (let yy = position?.[1] ?? 2; yy < 48 && created < batch; ++yy) {
							for (let xx = position?.[0] ?? 2; xx < 48 && created < batch; ++xx) {
								if (!isFree(xx, yy)) {
									continue;
								}
								assert.strictEqual(
									view.createConstructionSite(xx, yy, type as ConstructibleStructureType),
									C.OK,
									`${type} at (${xx},${yy})`,
								);
								++created;
							}
						}
						assert.strictEqual(created, batch, 'ran out of free tiles');
					});

					if (type === 'extractor') {
						// An extractor can only be placed on a mineral.
						let mineral!: RoomPosition;
						if (cap >= 1) {
							await player('100', Game => {
								mineral = Game.rooms.W1N1!.find(C.FIND_MINERALS)[0]!.pos;
								assert.strictEqual(Game.rooms.W1N1!.createConstructionSite(mineral.x, mineral.y, 'extractor'), C.OK);
							});
							await tick();
						} else {
							await player('100', Game => {
								const mineral = Game.rooms.W1N1!.find(C.FIND_MINERALS)[0]!.pos;
								assert.strictEqual(Game.rooms.W1N1!.createConstructionSite(mineral.x, mineral.y, 'extractor'), C.ERR_RCL_NOT_ENOUGH);
							});
							await tick();
							return;
						}
						// Over-limit creates see the materialized sites; the RCL check
						// runs before placement, so the position can repeat.
						await player('100', Game => {
							assert.strictEqual(Game.rooms.W1N1!.createConstructionSite(mineral.x, mineral.y, 'extractor'), C.ERR_RCL_NOT_ENOUGH);
						});
						await tick();
						return;
					}

					if (cap === 0) {
						// The RCL check runs before placement, so the position does not
						// need to be special.
						await player('100', Game => {
							assert.strictEqual(
								Game.rooms.W1N1!.createConstructionSite(25, 25, type as ConstructibleStructureType),
								C.ERR_RCL_NOT_ENOUGH,
								`${type} unexpectedly allowed at RCL ${level}`,
							);
						});
						return;
					}

					if (cap > maxSmallCap) {
						// The 2500-tile caps (road, wall, rampart) are unreachable under
						// MAX_CONSTRUCTION_SITES, so just check buildability; their exact
						// values are locked by the table test.
						await createUpTo(1);
						return;
					}

					// Vanilla parity: createConstructionSite's synchronous RCL check only
					// counts objects visible to the player, so within one tick the rules
					// accept every create and the processor silently drops the intents
					// beyond the cap. Walk through the cap two sites per tick so every
					// create sees the sites materialized so far, then check what the
					// next create beyond the cap reports.
					let placed = 0;
					while (placed < cap) {
						await createUpTo(Math.min(2, cap - placed));
						placed += Math.min(2, cap - placed);
						await tick();
					}

					// The processor dropped everything beyond the cap, and the next
					// create sees the sites from earlier ticks.
					await player('100', Game => {
						assert.strictEqual(
							Object.values(Game.constructionSites).filter(site => site.structureType === type).length,
							cap,
						);
						assert.strictEqual(Game.rooms.W1N1!.createConstructionSite(2, 2, type as ConstructibleStructureType), C.ERR_RCL_NOT_ENOUGH);
					});
				}));
			}
		}

		// An extension's energy capacity grows with the room's RCL at level-up.
		for (let level = 1; level <= 8; ++level) {
			const capacity = officialExtensionCapacity[level]!;
			const atLevel = simulate({
				W1N1: room => {
					room['#level'] = level;
					room['#user'] = room.controller!['#user'] = '100';
					room['#insertObject'](createExtension(new RoomPosition(2, 2, 'W1N1'), level, '100'));
				},
			});
			test(`extension energy capacity at RCL ${level}`, () => atLevel(async ({ player }) => {
				await player('100', Game => {
					const extensions = Game.rooms.W1N1!.find(C.FIND_MY_STRUCTURES, {
						filter: object => object.structureType === 'extension',
					});
					assert.strictEqual(extensions.length, 1);
					assert.strictEqual((extensions[0] as StructureExtension).store.getCapacity(C.RESOURCE_ENERGY), capacity);
				});
			}));
		}
	});
});
