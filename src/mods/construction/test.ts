import * as C from 'xxscreeps/game/constants/index.js';
import { Fn } from 'xxscreeps/utility/fn.js';
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
		// Place most sites in tick 1
		const firstBatch = C.MAX_CONSTRUCTION_SITES - 10;
		await player('100', Game => {
			for (const pos of Fn.range(firstBatch)) {
				const xx = 1 + (pos % 48);
				const yy = 1 + Math.floor(pos / 48);
				assert.strictEqual(Game.rooms.W1N1.createConstructionSite(xx, yy, 'road'), C.OK);
			}
		});
		await tick();
		// Try 11 more in tick 2 — first 10 should succeed, 11th should fail
		await player('100', Game => {
			assert.strictEqual(Object.keys(Game.constructionSites).length, firstBatch);
			for (const pos of Fn.range(firstBatch, C.MAX_CONSTRUCTION_SITES)) {
				const xx = 1 + (pos % 48);
				const yy = 1 + Math.floor(pos / 48);
				assert.strictEqual(Game.rooms.W1N1.createConstructionSite(xx, yy, 'road'), C.OK);
			}
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
