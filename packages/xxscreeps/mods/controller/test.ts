import type { GameConstructor } from 'xxscreeps/game/index.js';
import * as C from 'xxscreeps/game/constants/index.js';
import { RoomPosition } from 'xxscreeps/game/position.js';
import { create } from 'xxscreeps/mods/creep/creep.js';
import { getNotifications } from 'xxscreeps/mods/notifications/model.js';
import { create as createContainer } from 'xxscreeps/mods/resource/container.js';
import { assert, describe, simulate, test } from 'xxscreeps/test/index.js';
import { StructureController } from './controller.js';

describe('Controller', () => {

	// Controller in W3N3 is at (33, 32)
	const pos = new RoomPosition(34, 32, 'W3N3');
	const farPos = new RoomPosition(10, 10, 'W3N3');

	function setGclRoomCount(Game: GameConstructor, roomCount: number) {
		Game.gcl = {
			level: 1,
			progress: 0,
			progressTotal: C.GCL_MULTIPLY,
			'#roomCount': roomCount,
		};
	}

	function exhaustGcl(Game: GameConstructor) {
		setGclRoomCount(Game, 1);
	}

	function findContainer(Game: GameConstructor) {
		return Game.rooms.W3N3!.find(C.FIND_STRUCTURES)
			.find(structure => structure.structureType === C.STRUCTURE_CONTAINER)!;
	}

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

	const claimPrecedence = simulate({
		W3N3: room => {
			room['#insertObject'](create(pos, [ C.CLAIM ], 'claimer', '100'));
			room['#insertObject'](create(new RoomPosition(32, 32, 'W3N3'), [ C.MOVE ], 'worker', '100'));
			room['#insertObject'](create(farPos, [ C.CLAIM ], 'distantClaimer', '100'));
			room['#insertObject'](createContainer(pos));
		},
	});

	const neutralNoClaim = simulate({
		W3N3: room => {
			room['#insertObject'](create(pos, [ C.MOVE ], 'worker', '100'));
			room['#insertObject'](create(farPos, [ C.MOVE ], 'distantWorker', '100'));
			room['#insertObject'](createContainer(pos));
		},
	});

	const hostileNoClaim = simulate({
		W3N3: room => {
			room['#user'] = '101';
			room.controller!['#reservationEndTime'] = 5000;
			room['#insertObject'](create(pos, [ C.MOVE ], 'worker', '100'));
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
				const controller = Game.rooms.W3N3?.controller;
				assert.strictEqual(Game.creeps.claimer?.attackController(controller!), C.OK);
			});
		}));

		test('rejects neutral controller', () => neutralRoom(async ({ player }) => {
			await player('100', Game => {
				const controller = Game.rooms.W3N3?.controller;
				assert.strictEqual(Game.creeps.claimer?.attackController(controller!), C.ERR_INVALID_TARGET);
			});
		}));

		test('CTRL-ATTACK-007:invalid-target-before-no-bodypart', () => neutralNoClaim(async ({ player }) => {
			await player('100', Game => {
				assert.strictEqual(
					Game.creeps.worker!.attackController(findContainer(Game) as unknown as StructureController),
					C.ERR_INVALID_TARGET);
			});
		}));
	});

	describe('claimController', () => {

		test('CTRL-CLAIM-008:gcl-not-enough-before-invalid-target', () => claimPrecedence(async ({ player }) => {
			await player('100', Game => {
				exhaustGcl(Game);
				assert.strictEqual(
					Game.creeps.claimer!.claimController(findContainer(Game) as unknown as StructureController),
					C.ERR_GCL_NOT_ENOUGH);
			});
		}));

		test('CTRL-CLAIM-008:gcl-not-enough-before-no-bodypart', () => claimPrecedence(async ({ player }) => {
			await player('100', Game => {
				exhaustGcl(Game);
				const controller = Game.rooms.W3N3!.controller!;
				assert.strictEqual(Game.creeps.worker!.claimController(controller), C.ERR_GCL_NOT_ENOUGH);
			});
		}));

		test('CTRL-CLAIM-008:gcl-not-enough-before-range', () => claimPrecedence(async ({ player }) => {
			await player('100', Game => {
				exhaustGcl(Game);
				const controller = Game.rooms.W3N3!.controller!;
				assert.strictEqual(Game.creeps.distantClaimer!.claimController(controller), C.ERR_GCL_NOT_ENOUGH);
			});
		}));

		test('CTRL-CLAIM-008:invalid-target-before-no-bodypart', () => neutralNoClaim(async ({ player }) => {
			await player('100', Game => {
				setGclRoomCount(Game, 0);
				assert.strictEqual(
					Game.creeps.worker!.claimController(findContainer(Game) as unknown as StructureController),
					C.ERR_INVALID_TARGET);
			});
		}));
	});

	describe('signController', () => {

		const wrongTypeOutOfRange = simulate({
			W3N3: room => {
				room['#insertObject'](create(new RoomPosition(10, 10, 'W3N3'), [ C.MOVE ], 'signer', '100'));
				room['#insertObject'](createContainer(new RoomPosition(34, 32, 'W3N3')));
			},
		});

		test('out-of-range non-controller target returns ERR_NOT_IN_RANGE', () => wrongTypeOutOfRange(async ({ player }) => {
			await player('100', Game => {
				const container = Game.rooms.W3N3?.find(C.FIND_STRUCTURES)
					.find(structure => structure.structureType === C.STRUCTURE_CONTAINER);
					// @ts-expect-error
				const result = Game.creeps.signer?.signController(container, 'hello');
				assert.strictEqual(result, C.ERR_NOT_IN_RANGE);
			});
		}));

		test('null target returns ERR_INVALID_TARGET', () => wrongTypeOutOfRange(async ({ player }) => {
			await player('100', Game => {
				assert.strictEqual(
					Game.creeps.signer?.signController(null as unknown as StructureController, 'hello'),
					C.ERR_INVALID_TARGET);
			});
		}));
	});

	describe('reserveController', () => {

		test('rejects hostile reservation', () => hostileReservation(async ({ player }) => {
			await player('100', Game => {
				const controller = Game.rooms.W3N3?.controller;
				assert.strictEqual(Game.creeps.claimer?.reserveController(controller!), C.ERR_INVALID_TARGET);
			});
		}));

		test('succeeds on own reservation', () => ownReservation(async ({ player }) => {
			await player('100', Game => {
				const controller = Game.rooms.W3N3?.controller;
				assert.strictEqual(Game.creeps.claimer?.reserveController(controller!), C.OK);
			});
		}));

		test('CTRL-RESERVE-008:invalid-target-before-no-bodypart', () => neutralNoClaim(async ({ player }) => {
			await player('100', Game => {
				assert.strictEqual(
					Game.creeps.worker!.reserveController(findContainer(Game) as unknown as StructureController),
					C.ERR_INVALID_TARGET);
			});
		}));

		test('CTRL-RESERVE-008:range-before-no-bodypart', () => neutralNoClaim(async ({ player }) => {
			await player('100', Game => {
				const controller = Game.rooms.W3N3!.controller!;
				assert.strictEqual(Game.creeps.distantWorker!.reserveController(controller), C.ERR_NOT_IN_RANGE);
			});
		}));

		test('CTRL-RESERVE-008:invalid-controller-state-before-no-bodypart', () => hostileNoClaim(async ({ player }) => {
			await player('100', Game => {
				const controller = Game.rooms.W3N3!.controller!;
				assert.strictEqual(Game.creeps.worker!.reserveController(controller), C.ERR_INVALID_TARGET);
			});
		}));
	});

	describe('upgradeController', () => {

		const upgradeBlockedOutOfRange = simulate({
			W3N3: room => {
				room['#user'] = '100';
				room['#level'] = 1;
				room.controller!['#user'] = '100';
				room.controller!['#upgradeBlockedUntil'] = 1000;
				const worker = create(new RoomPosition(28, 32, 'W3N3'), [ C.WORK, C.CARRY ], 'worker', '100');
				worker.store['#add'](C.RESOURCE_ENERGY, 50);
				room['#insertObject'](worker);
			},
		});

		test('upgrade-blocked controller returns ERR_INVALID_TARGET before ERR_NOT_IN_RANGE', () => upgradeBlockedOutOfRange(async ({ player }) => {
			await player('100', Game => {
				const controller = Game.rooms.W3N3?.controller;
				assert.strictEqual(Game.creeps.worker?.upgradeController(controller!), C.ERR_INVALID_TARGET);
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
				assert.strictEqual(Game.rooms.W1N1?.controller?.activateSafeMode(), C.OK);
				assert.strictEqual(Game.rooms.W3N3?.controller?.activateSafeMode(), C.OK);
			});
			await tick();
			await player('100', Game => {
				assert.strictEqual(Game.rooms.W1N1?.controller?.safeMode, undefined);
				assert.notStrictEqual(Game.rooms.W3N3?.controller?.safeMode, undefined);
			});
		}));
	});

	describe('event log emissions', () => {

		test('attackController emits EVENT_ATTACK_CONTROLLER with no data', () => hostileReservation(async ({ player, tick }) => {
			await player('100', Game => {
				Game.creeps.claimer?.attackController(Game.rooms.W3N3!.controller!);
			});
			await tick();
			await player('100', Game => {
				const log = Game.rooms.W3N3!.getEventLog();
				const event = log.find(entry => entry.event === C.EVENT_ATTACK_CONTROLLER);
				assert.ok(event, 'expected EVENT_ATTACK_CONTROLLER');
				assert.strictEqual(event.objectId, Game.creeps.claimer?.id);
				assert.ok(!('data' in event),
					'EVENT_ATTACK_CONTROLLER must omit data field to match vanilla shape');
			});
		}));

		test('reserveController emits EVENT_RESERVE_CONTROLLER with amount', () => ownReservation(async ({ player, tick }) => {
			await player('100', Game => {
				Game.creeps.claimer?.reserveController(Game.rooms.W3N3!.controller!);
			});
			await tick();
			await player('100', Game => {
				const log = Game.rooms.W3N3!.getEventLog();
				const event = log.find(entry => entry.event === C.EVENT_RESERVE_CONTROLLER);
				assert.ok(event, 'expected EVENT_RESERVE_CONTROLLER');
				assert.strictEqual(event.objectId, Game.creeps.claimer?.id);
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
				Game.creeps.worker?.upgradeController(Game.rooms.W3N3!.controller!);
			});
			await tick();
			await player('100', Game => {
				const log = Game.rooms.W3N3!.getEventLog();
				const event = log.find(entry => entry.event === C.EVENT_UPGRADE_CONTROLLER);
				assert.ok(event, 'expected EVENT_UPGRADE_CONTROLLER');
				assert.strictEqual(event.objectId, Game.creeps.worker?.id);
				assert.ok(event.data, 'expected nested data payload');
				assert.strictEqual(event.data.amount, C.UPGRADE_CONTROLLER_POWER);
				assert.strictEqual(event.data.energySpent, C.UPGRADE_CONTROLLER_POWER);
			});
		}));
	});

	describe('lifecycle notifications', () => {

		// One UPGRADE_CONTROLLER_POWER pushes #progress to CONTROLLER_LEVELS[1] (=200) and triggers a level-up.
		const onCuspOfLevelUp = simulate({
			W3N3: room => {
				room['#user'] = '100';
				room['#level'] = 1;
				room.controller!['#user'] = '100';
				room.controller!['#progress'] = C.CONTROLLER_LEVELS[1]! - C.UPGRADE_CONTROLLER_POWER;
				room.controller!['#downgradeTime'] = 100_000;
				const worker = create(new RoomPosition(34, 32, 'W3N3'), [ C.WORK, C.CARRY ], 'worker', '100');
				worker.store['#add'](C.RESOURCE_ENERGY, 50);
				room['#insertObject'](worker);
			},
		});

		test('upgradeController level-up sends a notification', () => onCuspOfLevelUp(async ({ player, tick, shard }) => {
			await player('100', Game => {
				Game.creeps.worker?.upgradeController(Game.rooms.W3N3!.controller!);
			});
			await tick();
			const rows = await getNotifications(shard, '100');
			const row = rows.find(entry => entry.message.includes('upgraded to level'));
			assert.ok(row, 'expected level-up notification');
			assert.strictEqual(row.message, 'Your Controller in room W3N3 has been upgraded to level 2.');
			assert.strictEqual(row.type, 'msg');
		}));

		// L5 controller; first processed tick is at Game.time = 2, so downgradeTime sits exactly
		// on the warn boundary (== 3000 ticks away). Idle creep keeps the room active.
		const aboutToWarn = simulate({
			W3N3: room => {
				room['#user'] = '100';
				room['#level'] = 5;
				room.controller!['#user'] = '100';
				room.controller!['#downgradeTime'] = 2 + 3000;
				room['#insertObject'](create(new RoomPosition(10, 10, 'W3N3'), [ C.MOVE ], 'idle', '100'));
			},
		});

		test('pre-downgrade warning fires exactly once when ticksToDowngrade enters the 3000-tick window',
			() => aboutToWarn(async ({ tick, shard }) => {
				await tick(5);
				const rows = await getNotifications(shard, '100');
				const warnings = rows.filter(entry => entry.message.includes('will be downgraded'));
				const total = warnings.reduce((sum, entry) => sum + entry.count, 0);
				assert.strictEqual(total, 1, 'warning should fire exactly once even when room stays active');
				assert.strictEqual(warnings[0].message,
					'Attention! Your Controller in room W3N3 will be downgraded to level 4 in 3000 ticks (~2 hours)! ' +
					'Upgrade it to prevent losing of this room. ' +
					"<a href='http://support.screeps.com/hc/en-us/articles/203086021-Territory-control'>Learn more</a>");
				assert.strictEqual(warnings[0].type, 'msg');
			}));

		// Controller hits the downgrade tick on the first tick processed.
		const aboutToDowngrade = simulate({
			W3N3: room => {
				room['#user'] = '100';
				room['#level'] = 5;
				room.controller!['#user'] = '100';
				room.controller!['#downgradeTime'] = 2;
			},
		});

		test('downgrade sends a notification with the new level', () => aboutToDowngrade(async ({ tick, shard }) => {
			await tick();
			const rows = await getNotifications(shard, '100');
			const row = rows.find(entry => entry.message.includes('has been downgraded'));
			assert.ok(row, 'expected downgrade notification');
			assert.strictEqual(row.message,
				'Your Controller in room W3N3 has been downgraded to level 4 due to absence of upgrading activity!');
			assert.strictEqual(row.type, 'msg');
		}));

		// Pre-latch #downgradeWarningSent so the post-downgrade reset is observable: if
		// the downgrade tick fails to clear it, the next warning never fires.
		const downgradeAndRewarn = simulate({
			W3N3: room => {
				room['#user'] = '100';
				room['#level'] = 5;
				room.controller!['#user'] = '100';
				room.controller!['#downgradeTime'] = 2;
				room.controller!['#downgradeWarningSent'] = true;
				room['#insertObject'](create(new RoomPosition(10, 10, 'W3N3'), [ C.MOVE ], 'idle', '100'));
			},
		});

		test('pre-downgrade warning re-arms after a downgrade tick',
			() => downgradeAndRewarn(async ({ tick, poke, shard }) => {
				await tick();
				// Second processed tick is at Game.time = 3; place downgradeTime on the warn boundary.
				await poke('W3N3', undefined, (_Game, room) => {
					room.controller!['#downgradeTime'] = 3 + 3000;
				});
				await tick();
				const rows = await getNotifications(shard, '100');
				const downgrades = rows.filter(entry => entry.message.includes('has been downgraded'));
				const warnings = rows.filter(entry => entry.message.includes('will be downgraded'));
				const downgradeTotal = downgrades.reduce((sum, entry) => sum + entry.count, 0);
				const warningTotal = warnings.reduce((sum, entry) => sum + entry.count, 0);
				assert.strictEqual(downgradeTotal, 1, 'downgrade fired once');
				assert.strictEqual(warningTotal, 1, 'fresh warning fired exactly once after downgrade');
				const [ downgrade ] = downgrades;
				const [ warning ] = warnings;
				assert.ok(downgrade && warning);
				assert.strictEqual(downgrade.message,
					'Your Controller in room W3N3 has been downgraded to level 4 due to absence of upgrading activity!');
				assert.strictEqual(warning.message,
					'Attention! Your Controller in room W3N3 will be downgraded to level 3 in 3000 ticks (~2 hours)! ' +
					'Upgrade it to prevent losing of this room. ' +
					"<a href='http://support.screeps.com/hc/en-us/articles/203086021-Territory-control'>Learn more</a>");
			}));
	});
});
