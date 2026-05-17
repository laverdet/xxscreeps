import type { Room } from 'xxscreeps/game/room/index.js';
import * as C from 'xxscreeps/game/constants/index.js';
import { RoomPosition } from 'xxscreeps/game/position.js';
import { create as createCreep } from 'xxscreeps/mods/creep/creep.js';
import { create as createContainer } from 'xxscreeps/mods/resource/container.js';
import { create as createSpawn } from 'xxscreeps/mods/spawn/spawn.js';
import { createRuin } from 'xxscreeps/mods/structure/ruin.js';
import { lookForStructures } from 'xxscreeps/mods/structure/structure.js';
import { assert, describe, simulate, test } from 'xxscreeps/test/index.js';
import { create as createSite } from './construction-site.js';

describe('Construction', () => {
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

		test('CONSTRUCTION-SITE-011:rcl-or-structure-cap-before-site-cap-full', () => rclCappedAndFull(async ({ player }) => {
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

		test('CONSTRUCTION-SITE-011:invalid-target-before-site-cap-full', () => sameTypeAndFull(async ({ player }) => {
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

		test('CONSTRUCTION-SITE-011:not-owner', () => foreignOwned(async ({ player }) => {
			await player('100', Game => {
				assert.strictEqual(Game.rooms.W1N1!.createConstructionSite(25, 25, 'road'), C.ERR_NOT_OWNER);
			});
		}));

		const foreignOwnedRclCapped = simulate({
			W1N1: room => setupForeignRoom(room, 1),
		});

		test('CONSTRUCTION-SITE-011:not-owner-before-rcl-or-structure-cap', () => foreignOwnedRclCapped(async ({ player }) => {
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

		test('CONSTRUCTION-SITE-011:not-owner-before-invalid-target', () => foreignOwnedInvalidTarget(async ({ player }) => {
			await player('100', Game => {
				assert.strictEqual(Game.rooms.W1N1!.createConstructionSite(25, 25, 'road'), C.ERR_NOT_OWNER);
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

		test('CONSTRUCTION-SITE-011:not-owner-before-site-cap-full', () => foreignOwnedAndFull(async ({ player }) => {
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

		test('CONSTRUCTION-SITE-011:invalid-args', () => ownedRcl8(async ({ player }) => {
			await player('100', Game => {
				assert.strictEqual(Game.rooms.W1N1!.createConstructionSite(25, 25, 'spawn', oversizedName), C.ERR_INVALID_ARGS);
			});
		}));

		test('CONSTRUCTION-SITE-011:invalid-args-before-not-owner', () => foreignOwned(async ({ player }) => {
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

		test('CONSTRUCTION-SITE-011:invalid-args-before-rcl-or-structure-cap', () => ownedRcl1WithSpawn(async ({ player }) => {
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

		test('CONSTRUCTION-SITE-011:invalid-args-before-invalid-target', () => ownedWithRoadSite(async ({ player }) => {
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

		test('CONSTRUCTION-SITE-011:invalid-args-before-site-cap-full', () => ownedAndFull(async ({ player }) => {
			await player('100', Game => {
				// (49, 49) is outside `fillSites`' (1,1)-(4,3) range, so any non-INVALID_ARGS slip-up
				// would fall through to the cap and surface ERR_FULL.
				assert.strictEqual(Game.rooms.W1N1!.createConstructionSite(49, 49, 'spawn', oversizedName), C.ERR_INVALID_ARGS);
			});
		}));
	});

	test('create two sites at same position', () => construction(async ({ player, tick }) => {
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

	test('create site on ruin with same structure type', () => {
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

	describe('creep intent precedence', () => {
		const noEnergyWorker = simulate({
			W1N1: room => {
				room['#level'] = 8;
				room['#user'] = room.controller!['#user'] = '100';
				room['#insertObject'](createCreep(new RoomPosition(10, 10, 'W1N1'), [ C.WORK, C.CARRY ], 'worker', '100'));
			},
		});

		test('REPAIR-010:not-enough-before-invalid-target', () => noEnergyWorker(async ({ player }) => {
			await player('100', Game => {
				assert.strictEqual(Game.creeps.worker!.repair(undefined as never), C.ERR_NOT_ENOUGH_RESOURCES);
			});
		}));

		test('BUILD-011:not-enough-before-invalid-target', () => noEnergyWorker(async ({ player }) => {
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

		test('REPAIR-010:not-enough-before-range', () => noEnergyOutOfRange(async ({ player }) => {
			await player('100', Game => {
				const container = lookForStructures(Game.rooms.W1N1, C.STRUCTURE_CONTAINER)[0]!;
				assert.strictEqual(Game.creeps.worker!.repair(container), C.ERR_NOT_ENOUGH_RESOURCES);
			});
		}));

		test('BUILD-011:not-enough-before-range', () => noEnergyOutOfRange(async ({ player }) => {
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

		test('BUILD-011:not-enough-before-blocked-target', () => noEnergyBlockedTarget(async ({ player }) => {
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

		test('BUILD-011:range-before-blocked-target', () => blockedTargetOutOfRange(async ({ player }) => {
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

	describe('event log emissions', () => {
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

	describe('dismantle validation', () => {
		const controllerSim = simulate({
			W1N1: room => {
				room['#level'] = 1;
				room['#user'] = room.controller!['#user'] = '100';
				const controllerPos = room.controller!.pos;
				room['#insertObject'](createCreep(new RoomPosition(controllerPos.x - 1, controllerPos.y, 'W1N1'), [ C.WORK ], 'near', '100'));
				room['#insertObject'](createCreep(new RoomPosition(1, 1, 'W1N1'), [ C.WORK ], 'far', '100'));
			},
		});

		test('dismantle(controller) returns ERR_INVALID_TARGET', () => controllerSim(async ({ player }) => {
			await player('100', Game => {
				const controller = Game.rooms.W1N1!.controller!;
				assert.strictEqual(Game.creeps.near?.dismantle(controller), C.ERR_INVALID_TARGET);
			});
		}));

		test('dismantle(controller) returns ERR_INVALID_TARGET before ERR_NOT_IN_RANGE', () => controllerSim(async ({ player }) => {
			await player('100', Game => {
				const controller = Game.rooms.W1N1!.controller!;
				assert.strictEqual(Game.creeps.far?.dismantle(controller), C.ERR_INVALID_TARGET);
			});
		}));
	});
});
