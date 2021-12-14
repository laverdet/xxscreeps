import * as C from 'xxscreeps/game/constants';
import { assert, describe, simulate, test } from 'xxscreeps/test';

describe('Power', () => {
	const simulation = simulate({
		W0N0: room => {
			room['#user'] = '100';
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
