import * as C from 'xxscreeps/game/constants/index.js';
import { RoomPosition } from 'xxscreeps/game/position.js';
import { create } from 'xxscreeps/mods/creep/creep.js';
import { assert, describe, simulate, test } from 'xxscreeps/test/index.js';

describe('Controller', () => {

	// Controller in W3N3 is at (33, 32)
	const pos = new RoomPosition(34, 32, 'W3N3');

	const hostileReservation = simulate({
		W3N3: room => {
			room['#user'] = '101';
			room.controller!['#reservationEndTime'] = 5000;
			room['#insertObject'](create(pos, [ C.CLAIM, C.MOVE ], 'claimer', '100'));
		},
	});

	const neutralRoom = simulate({
		W3N3: room => {
			room['#insertObject'](create(pos, [ C.CLAIM, C.MOVE ], 'claimer', '100'));
		},
	});

	const ownReservation = simulate({
		W3N3: room => {
			room['#user'] = '100';
			room.controller!['#reservationEndTime'] = 5000;
			room['#insertObject'](create(pos, [ C.CLAIM, C.MOVE ], 'claimer', '100'));
		},
	});

	describe('attackController', () => {

		test('succeeds on hostile reservation', () => hostileReservation(async ({ player }) => {
			await player('100', Game => {
				const controller = Game.rooms.W3N3.controller!;
				assert.strictEqual(Game.creeps.claimer.attackController(controller), C.OK);
			});
		}));

		test('rejects neutral controller', () => neutralRoom(async ({ player }) => {
			await player('100', Game => {
				const controller = Game.rooms.W3N3.controller!;
				assert.strictEqual(Game.creeps.claimer.attackController(controller), C.ERR_INVALID_TARGET);
			});
		}));
	});

	describe('reserveController', () => {

		test('rejects hostile reservation', () => hostileReservation(async ({ player }) => {
			await player('100', Game => {
				const controller = Game.rooms.W3N3.controller!;
				assert.strictEqual(Game.creeps.claimer.reserveController(controller), C.ERR_INVALID_TARGET);
			});
		}));

		test('succeeds on own reservation', () => ownReservation(async ({ player }) => {
			await player('100', Game => {
				const controller = Game.rooms.W3N3.controller!;
				assert.strictEqual(Game.creeps.claimer.reserveController(controller), C.OK);
			});
		}));
	});

	describe('activateSafeMode', () => {

		const ownedTwoRooms = simulate({
			W1N1: room => {
				room['#level'] = 8;
				room['#user'] = room.controller!['#user'] = '100';
				room.controller!.safeModeAvailable = 1;
			},
			W3N3: room => {
				room['#level'] = 8;
				room['#user'] = room.controller!['#user'] = '100';
				room.controller!.safeModeAvailable = 1;
			},
		});

		test('caps at one activation per tick across controllers', () => ownedTwoRooms(async ({ player, tick }) => {
			await player('100', Game => {
				assert.strictEqual(Game.rooms.W1N1.controller!.activateSafeMode(), C.OK);
				assert.strictEqual(Game.rooms.W3N3.controller!.activateSafeMode(), C.OK);
			});
			await tick();
			await player('100', Game => {
				assert.strictEqual(Game.rooms.W1N1.controller!.safeMode, undefined);
				assert.notStrictEqual(Game.rooms.W3N3.controller!.safeMode, undefined);
			});
		}));
	});
});
