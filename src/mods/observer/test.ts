import type { GameConstructor } from 'xxscreeps/game';
import * as C from 'xxscreeps/game/constants';
import { RoomPosition } from 'xxscreeps/game/position';
import type { Room } from 'xxscreeps/game/room';
import { assert, describe, simulate, test } from 'xxscreeps/test';

import type { StructureObserver } from './observer';
import { create } from './observer';

describe('Observer', () => {
	const simulation = simulate({
		W1N1: room => {
			room['#insertObject'](create(new RoomPosition(25, 25, 'W1N1'), '100'));
			room['#level'] = 8;
			room['#user'] =
				room.controller!['#user'] = '100';
		},
		W1N2: room => {
			room['#insertObject'](create(new RoomPosition(25, 25, 'W1N2'), '100'));
			room['#level'] = 7;
			room['#user'] =
				room.controller!['#user'] = '100';
		},
		W2N2: _room => {},
	});

	test('observer_visibility', () => simulation(async({ player, tick, poke }) => {
		await player('100', Game => {
			const observer = Game.rooms.W1N1.find(C.FIND_STRUCTURES, { filter: { structureType: C.STRUCTURE_OBSERVER } })[0] as StructureObserver;
			const result = observer.observeRoom('W2N2');
			assert.strictEqual(result, C.OK, 'observeRoom return value should be OK');
			assert.strictEqual(Game.rooms.W2N2, undefined, 'room should not be visible');
		});

		await tick(1);

		await poke('W2N2', undefined, (game: GameConstructor, room: Room) => {
			assert.ok(room['#objects'].filter(o => o.constructor.name === 'ObserverSpy').length === 1, 'there should be one ObserverSpy in the room');
		});

		await player('100', Game => {
			assert.ok(Game.rooms.W2N2, 'room should be visible now');
		});

		await tick(1);

		await poke('W2N2', undefined, (game: GameConstructor, room: Room) => {
			assert.ok(room['#objects'].filter(o => o.constructor.name === 'ObserverSpy').length === 0, 'there should be no ObserverSpy anymore');
		});

		await player('100', Game => {
			assert.strictEqual(Game.rooms.W2N2, undefined, 'room should not longer be visible');
		});
	}),
	);

	test('observer_illegal_arg', () => simulation(async({ player }) => {
		await player('100', Game => {
			const observer = Game.rooms.W1N1.find(C.FIND_MY_STRUCTURES, { filter: { structureType: C.STRUCTURE_OBSERVER } })[0] as StructureObserver;
			const result = observer.observeRoom('INVALID');
			assert.strictEqual(result, C.ERR_INVALID_ARGS, 'observeRoom return value should be ERR_INVALID_ARGS');
		});
	}),
	);

	test('observer_range', () => simulation(async({ player }) => {
		await player('100', Game => {
			const observer = Game.rooms.W1N1.find(C.FIND_MY_STRUCTURES, { filter: { structureType: C.STRUCTURE_OBSERVER } })[0] as StructureObserver;
			const result = observer.observeRoom('W20N2');
			assert.strictEqual(result, C.ERR_NOT_IN_RANGE, 'observeRoom return value should be ERR_NOT_IN_RANGE');
		});
	}),
	);

	test('observer_min_level', () => simulation(async({ player }) => {
		await player('100', Game => {
			const observer = Game.rooms.W1N2.find(C.FIND_MY_STRUCTURES, { filter: { structureType: C.STRUCTURE_OBSERVER } })[0] as StructureObserver;
			const result = observer.observeRoom('W2N2');
			assert.strictEqual(result, C.ERR_RCL_NOT_ENOUGH, 'observeRoom return value should be ERR_RCL_NOT_ENOUGH');
		});
	}),
	);
});
