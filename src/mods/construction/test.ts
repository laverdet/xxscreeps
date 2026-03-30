import * as C from 'xxscreeps/game/constants/index.js';
import { RoomPosition } from 'xxscreeps/game/position.js';
import { create as createCreep } from 'xxscreeps/mods/creep/creep.js';
import { create as createConstructionSite } from './construction-site.js';
import { assert, describe, simulate, test } from 'xxscreeps/test/index.js';

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
});

describe('Construction site movement', () => {
	const roomWithSpawnSite = simulate({
		W0N0: room => {
			room['#level'] = 3;
			room['#user'] = '100';
			room['#insertObject'](createCreep(new RoomPosition(24, 25, 'W0N0'), [ C.MOVE ], 'spawn_movement', '100'));
			room['#insertObject'](createConstructionSite(new RoomPosition(25, 25, 'W0N0'), 'spawn', '100'));
		},
	});

	test('move should pass through obstacle-type csite', () => roomWithSpawnSite(async ({ player, tick }) => {
		await player('100', Game => {
			assert.strictEqual(Game.creeps.spawn_movement.move(C.RIGHT), C.OK);
		});
		await tick();
		await player('100', Game => {
			const { x, y } = Game.creeps.spawn_movement.pos;
			assert.strictEqual(x, 25);
			assert.strictEqual(y, 25);
		});
	}));

	test('moveTo should pass through obstacle-type csite', () => roomWithSpawnSite(async ({ player, tick }) => {
		await player('100', Game => {
			assert.strictEqual(Game.creeps.spawn_movement.moveTo(25, 25), C.OK);
		});
		await tick();
		await player('100', Game => {
			const { x, y } = Game.creeps.spawn_movement.pos;
			assert.strictEqual(x, 25);
			assert.strictEqual(y, 25);
		});
	}));
});
