import * as C from 'xxscreeps/game/constants/index.js';
import { RoomPosition } from 'xxscreeps/game/position.js';
import { create as createCreep } from 'xxscreeps/mods/creep/creep.js';
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
			Game.rooms.W1N1.createConstructionSite(25, 25, 'road');
		});
		await tick();
		await player('100', Game => {
			// Should create a site
			assert(Object.values(Game.constructionSites).length === 1);
		});
	}));
	test('create two sites at same position', () => construction(async ({ player, tick }) => {
		await player('100', Game => {
			Game.rooms.W1N1.createConstructionSite(25, 25, 'road');
			Game.rooms.W1N1.createConstructionSite(25, 25, 'rampart');
		});
		await tick();
		await player('100', Game => {
			assert(
				// Only the first command should create a site
				Object.values(Game.constructionSites).length === 1 &&
                Object.values(Game.constructionSites)[0]?.structureType === 'road',
			);
		});
	}));

	describe('stomping', () => {
		const stomping = simulate({
			W1N1: room => {
				room['#level'] = 1;
				room['#user'] = room.controller!['#user'] = '100';
				// Enemy creep one tile above the construction site
				room['#insertObject'](createCreep(new RoomPosition(25, 24, 'W1N1'), [ C.MOVE ], 'enemy', '101'));
				// Owner's construction site with some progress
				const site = createSite(new RoomPosition(25, 25, 'W1N1'), 'road', '100');
				site.progress = 200;
				room['#insertObject'](site);
			},
		});

		test('enemy creep destroys hostile construction site on move', () => stomping(async ({ player, tick }) => {
			await player('101', Game => {
				assert.strictEqual(Game.creeps.enemy.move(C.BOTTOM), C.OK);
			});
			await tick();
			await player('101', Game => {
				// Creep should have moved
				assert(Game.creeps.enemy.pos.isEqualTo(25, 25));
			});
			await player('100', Game => {
				// Construction site should be destroyed
				assert.strictEqual(Object.values(Game.constructionSites).length, 0);
				// Half of progress should be dropped as energy at the site position (minus 1 tick of decay)
				const energy = Game.rooms.W1N1.find(C.FIND_DROPPED_RESOURCES);
				assert.strictEqual(energy.length, 1);
				assert(energy[0].pos.isEqualTo(25, 25));
				assert.strictEqual(energy[0].resourceType, C.RESOURCE_ENERGY);
				assert.strictEqual(energy[0].amount, 100 - Math.ceil(100 / C.ENERGY_DECAY));
			});
		}));

		const ownStomp = simulate({
			W1N1: room => {
				room['#level'] = 1;
				room['#user'] = room.controller!['#user'] = '100';
				room['#insertObject'](createCreep(new RoomPosition(25, 24, 'W1N1'), [ C.MOVE ], 'own', '100'));
				const site = createSite(new RoomPosition(25, 25, 'W1N1'), 'road', '100');
				site.progress = 200;
				room['#insertObject'](site);
			},
		});

		test('own creep does not destroy own construction site', () => ownStomp(async ({ player, tick }) => {
			await player('100', Game => {
				assert.strictEqual(Game.creeps.own.move(C.BOTTOM), C.OK);
			});
			await tick();
			await player('100', Game => {
				assert(Game.creeps.own.pos.isEqualTo(25, 25));
				assert.strictEqual(Object.values(Game.constructionSites).length, 1);
			});
		}));

		const zeroProgress = simulate({
			W1N1: room => {
				room['#level'] = 1;
				room['#user'] = room.controller!['#user'] = '100';
				room['#insertObject'](createCreep(new RoomPosition(25, 24, 'W1N1'), [ C.MOVE ], 'enemy', '101'));
				const site = createSite(new RoomPosition(25, 25, 'W1N1'), 'road', '100');
				// progress defaults to 0
				room['#insertObject'](site);
			},
		});

		test('stomps site with no progress, drops no energy', () => zeroProgress(async ({ player, tick }) => {
			await player('101', Game => {
				assert.strictEqual(Game.creeps.enemy.move(C.BOTTOM), C.OK);
			});
			await tick();
			await player('100', Game => {
				assert.strictEqual(Object.values(Game.constructionSites).length, 0);
				const energy = Game.rooms.W1N1.find(C.FIND_DROPPED_RESOURCES);
				assert.strictEqual(energy.length, 0);
			});
		}));

		const stompingSafeMode = simulate({
			W1N1: room => {
				room['#level'] = 1;
				room['#user'] = room.controller!['#user'] = '100';
				room['#safeModeUntil'] = 100;
				room['#insertObject'](createCreep(new RoomPosition(25, 24, 'W1N1'), [ C.MOVE ], 'enemy', '101'));
				const site = createSite(new RoomPosition(25, 25, 'W1N1'), 'road', '100');
				site.progress = 200;
				room['#insertObject'](site);
			},
		});

		test('safe mode prevents stomping', () => stompingSafeMode(async ({ player, tick }) => {
			await player('101', Game => {
				assert.strictEqual(Game.creeps.enemy.move(C.BOTTOM), C.OK);
			});
			await tick();
			await player('101', Game => {
				// Creep should still move onto the tile
				assert(Game.creeps.enemy.pos.isEqualTo(25, 25));
			});
			await player('100', Game => {
				// Construction site should survive during safe mode
				assert.strictEqual(Object.values(Game.constructionSites).length, 1);
			});
		}));

		const noController = simulate({
			W0N0: room => {
				room['#insertObject'](createCreep(new RoomPosition(25, 24, 'W0N0'), [ C.MOVE ], 'enemy', '101'));
				const site = createSite(new RoomPosition(25, 25, 'W0N0'), 'road', '100');
				site.progress = 100;
				room['#insertObject'](site);
			},
		});

		test('stomps in unowned room with no controller', () => noController(async ({ player, tick }) => {
			await player('101', Game => {
				assert.strictEqual(Game.creeps.enemy.move(C.BOTTOM), C.OK);
			});
			await tick();
			await player('101', Game => {
				assert(Game.creeps.enemy.pos.isEqualTo(25, 25));
			});
			await player('100', Game => {
				assert.strictEqual(Object.values(Game.constructionSites).length, 0);
			});
		}));
	});
});
