import { assert, describe, simulate, test } from 'xxscreeps/test';

describe('Construction', () => {
	const construction = simulate({
		W1N1: room => {
			room['#level'] = 8;
			room['#user'] = room.controller!['#user'] = '100';
		},
	});

	test('create site', () => construction(async({ player, tick }) => {
		await player('100', Game => {
			Game.rooms.W1N1.createConstructionSite(25, 25, 'road');
		});
		await tick();
		await player('100', Game => {
			// Should create a site
			assert(Object.values(Game.constructionSites).length === 1);
		});
	}));
	test('create two sites at same position', () => construction(async({ player, tick }) => {
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
