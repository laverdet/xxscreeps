import * as C from 'xxscreeps/game/constants/index.js';
import { assert, describe, simulate, test } from 'xxscreeps/test/index.js';
import { RoomPosition } from 'xxscreeps/game/position.js';
import { create as createConstructionSite } from 'xxscreeps/mods/construction/construction-site.js';
import { create as createCreep } from 'xxscreeps/mods/creep/creep.js';

describe('ramparts', () => {
	const roomWithUnbuiltRamparts = simulate({
		W0N0: room => {
			room['#level'] = 3;
			room['#user'] = '100';
			room['#insertObject'](createCreep(new RoomPosition(24, 25, 'W0N0'), [ C.MOVE ], 'rampart_movement', '100'));
			room['#insertObject'](createConstructionSite(new RoomPosition(25, 25, 'W0N0'), 'rampart', '100'));
		},
	});

	test('moveTo should be able to pass trough rampart csite', () => roomWithUnbuiltRamparts(async({ player, tick }) => {
		await player('100', Game => {
			assert.strictEqual(Game.creeps.rampart_movement.moveTo(25, 25), C.OK);
		});

		await tick();

		await player('100', Game => {
			const pos = Game.creeps.rampart_movement.pos;
			const { x, y } = pos;
			assert.strictEqual(x, 25);
			assert.strictEqual(y, 25);
		});
	}));

	test('move should be able to pass trough rampart csite', () => roomWithUnbuiltRamparts(async({ player, tick }) => {
		await player('100', Game => {
			assert.strictEqual(Game.creeps.rampart_movement.move(C.RIGHT), C.OK);
		});

		await tick();

		await player('100', Game => {
			const pos = Game.creeps.rampart_movement.pos;
			const { x, y } = pos;
			assert.strictEqual(x, 25);
			assert.strictEqual(y, 25);
		});
	}));
});
