import * as C from 'xxscreeps/game/constants';
import { assert, describe, simulate, test } from 'xxscreeps/test';
import { RoomPosition } from 'xxscreeps/game/position';
import { create } from 'xxscreeps/mods/spawn/spawn';
describe('Power', () => {
	const simulation = simulate({
		W1N1: room => {
		},
	});

	test('RESOURCE_OPS', () => simulation(async({ player, tick }) => {
		assert(C.RESOURCE_OPS === 'ops');

		await player('100', Game => {
			assert(C.RESOURCE_OPS);
			assert.strictEqual(C.RESOURCE_OPS, 'ops');
		});
	}));
});
