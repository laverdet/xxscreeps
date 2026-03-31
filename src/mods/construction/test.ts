import * as C from 'xxscreeps/game/constants/index.js';
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
	test('max construction sites', () => construction(async ({ player, tick }) => {
		// Place MAX_CONSTRUCTION_SITES roads in one tick
		await player('100', Game => {
			for (let ii = 0; ii < C.MAX_CONSTRUCTION_SITES; ++ii) {
				const x = 1 + (ii % 48);
				const y = 1 + Math.floor(ii / 48);
				assert.strictEqual(Game.rooms.W1N1.createConstructionSite(x, y, 'road'), C.OK);
			}
		});
		await tick();
		await player('100', Game => {
			assert.strictEqual(Object.keys(Game.constructionSites).length, C.MAX_CONSTRUCTION_SITES);
		});
		// 101st should fail with ERR_FULL
		await player('100', Game => {
			assert.strictEqual(Game.rooms.W1N1.createConstructionSite(1, 4, 'road'), C.ERR_FULL);
		});
		// Remove one site, then creating should succeed again
		await player('100', Game => {
			Object.values(Game.constructionSites)[0]!.remove();
		});
		await tick();
		await player('100', Game => {
			assert.strictEqual(Object.keys(Game.constructionSites).length, C.MAX_CONSTRUCTION_SITES - 1);
			assert.strictEqual(Game.rooms.W1N1.createConstructionSite(1, 4, 'road'), C.OK);
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
