import * as C from 'xxscreeps/game/constants/index.js';
import { RoomPosition } from 'xxscreeps/game/position.js';
import { create as createObserver } from 'xxscreeps/mods/observer/observer.js';
import { lookForStructures } from 'xxscreeps/mods/structure/structure.js';
import { assert, describe, simulate, test } from 'xxscreeps/test/index.js';

describe('Inter-room finalize', () => {
	const simulation = simulate({
		W1N1: room => {
			room['#insertObject'](createObserver(new RoomPosition(25, 25, 'W1N1'), '100'));
			room['#level'] = 8;
			room['#user'] =
				room.controller!['#user'] = '100';
		},
	});

	test('intent into non-processed room saves at next tick', () => simulation(async ({ peekRoom, player, shard, tick }) => {
		const startTime = shard.time;
		await player('100', Game => {
			const observer = lookForStructures(Game.rooms.W1N1, C.STRUCTURE_OBSERVER)[0];
			const result = observer?.observeRoom('W2N2');
			assert.strictEqual(result, C.OK);
		});
		await tick();
		assert.strictEqual(shard.time, startTime + 1);
		await peekRoom('W2N2', room => {
			assert.ok(
				room['#objects'].some(object => object.constructor.name === 'ObserverSpy'),
				'inter-room intent should have landed an ObserverSpy in W2N2',
			);
		});
	}));
});
