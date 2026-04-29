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

	describe('event log emissions', () => {

		test('attackController emits EVENT_ATTACK_CONTROLLER with no data', () => hostileReservation(async ({ player, tick }) => {
			await player('100', Game => {
				Game.creeps.claimer.attackController(Game.rooms.W3N3.controller!);
			});
			await tick();
			await player('100', Game => {
				const log = Game.rooms.W3N3.getEventLog();
				const event = log.find(entry => entry.event === C.EVENT_ATTACK_CONTROLLER);
				assert.ok(event, 'expected EVENT_ATTACK_CONTROLLER');
				assert.strictEqual(event.objectId, Game.creeps.claimer.id);
				assert.ok(!('data' in event),
					'EVENT_ATTACK_CONTROLLER must omit data field to match vanilla shape');
			});
		}));

		test('reserveController emits EVENT_RESERVE_CONTROLLER with amount', () => ownReservation(async ({ player, tick }) => {
			await player('100', Game => {
				Game.creeps.claimer.reserveController(Game.rooms.W3N3.controller!);
			});
			await tick();
			await player('100', Game => {
				const log = Game.rooms.W3N3.getEventLog();
				const event = log.find(entry => entry.event === C.EVENT_RESERVE_CONTROLLER);
				assert.ok(event, 'expected EVENT_RESERVE_CONTROLLER');
				assert.strictEqual(event.objectId, Game.creeps.claimer.id);
				assert.ok(event.data, 'expected nested data payload');
				assert.strictEqual(event.data.amount, C.CONTROLLER_RESERVE);
			});
		}));

		// Controller at (33,32); worker at (34,32) holds 50 energy and one WORK.
		const upgradeSim = simulate({
			W3N3: room => {
				room['#user'] = '100';
				room['#level'] = 1;
				room.controller!['#user'] = '100';
				room.controller!['#downgradeTime'] = 1000;
				const worker = create(new RoomPosition(34, 32, 'W3N3'), [ C.WORK, C.CARRY ], 'worker', '100');
				worker.store['#add'](C.RESOURCE_ENERGY, 50);
				room['#insertObject'](worker);
			},
		});

		test('upgradeController emits EVENT_UPGRADE_CONTROLLER with amount and energySpent', () => upgradeSim(async ({ player, tick }) => {
			await player('100', Game => {
				Game.creeps.worker.upgradeController(Game.rooms.W3N3.controller!);
			});
			await tick();
			await player('100', Game => {
				const log = Game.rooms.W3N3.getEventLog();
				const event = log.find(entry => entry.event === C.EVENT_UPGRADE_CONTROLLER);
				assert.ok(event, 'expected EVENT_UPGRADE_CONTROLLER');
				assert.strictEqual(event.objectId, Game.creeps.worker.id);
				assert.ok(event.data, 'expected nested data payload');
				assert.strictEqual(event.data.amount, C.UPGRADE_CONTROLLER_POWER);
				assert.strictEqual(event.data.energySpent, C.UPGRADE_CONTROLLER_POWER);
			});
		}));
	});
});
