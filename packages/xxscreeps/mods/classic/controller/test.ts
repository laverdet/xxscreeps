import type { GameConstructor } from 'xxscreeps/game/index.js';
import { RoomPosition } from 'xxscreeps/game/position.js';
import { create } from 'xxscreeps/mods/classic/creep/creep.js';
import { create as createContainer } from 'xxscreeps/mods/classic/resource/container.js';
import { create as createExtension } from 'xxscreeps/mods/classic/spawn/extension.js';
import { lookForStructures } from 'xxscreeps/mods/classic/structure/structure.js';
import { setNotifyPrefs } from 'xxscreeps/mods/meta/notifications/prefs.js';
import { captureNotificationsForTesting } from 'xxscreeps/mods/meta/notifications/transports.js';
import { assert, describe, simulate, test } from 'xxscreeps/test/index.js';
import * as C from 'xxscreeps:mods/constants';
import { StructureController } from './controller.js';

describe('mods/classic/controller', () => {

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

		test('invalid target before no bodypart', () => neutralNoClaim(async ({ player }) => {
			await player('100', Game => {
				assert.strictEqual(
					Game.creeps.worker!.attackController(findContainer(Game) as unknown as StructureController),
					C.ERR_INVALID_TARGET);
			});
		}));
	});

	describe('claimController', () => {

		test('gcl not enough before invalid target', () => claimPrecedence(async ({ player }) => {
			await player('100', Game => {
				exhaustGcl(Game);
				assert.strictEqual(
					Game.creeps.claimer!.claimController(findContainer(Game) as unknown as StructureController),
					C.ERR_GCL_NOT_ENOUGH);
			});
		}));

		test('gcl not enough before no bodypart', () => claimPrecedence(async ({ player }) => {
			await player('100', Game => {
				exhaustGcl(Game);
				const controller = Game.rooms.W3N3!.controller!;
				assert.strictEqual(Game.creeps.worker!.claimController(controller), C.ERR_GCL_NOT_ENOUGH);
			});
		}));

		test('gcl not enough before range', () => claimPrecedence(async ({ player }) => {
			await player('100', Game => {
				exhaustGcl(Game);
				const controller = Game.rooms.W3N3!.controller!;
				assert.strictEqual(Game.creeps.distantClaimer!.claimController(controller), C.ERR_GCL_NOT_ENOUGH);
			});
		}));

		test('invalid target before no bodypart', () => neutralNoClaim(async ({ player }) => {
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

		test('out-of-range non-controller target', () => wrongTypeOutOfRange(async ({ player }) => {
			await player('100', Game => {
				const container = Game.rooms.W3N3?.find(C.FIND_STRUCTURES)
					.find(structure => structure.structureType === C.STRUCTURE_CONTAINER);
					// @ts-expect-error
				const result = Game.creeps.signer?.signController(container, 'hello');
				assert.strictEqual(result, C.ERR_NOT_IN_RANGE);
			});
		}));

		test('null target', () => wrongTypeOutOfRange(async ({ player }) => {
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

		test('invalid target before no bodypart', () => neutralNoClaim(async ({ player }) => {
			await player('100', Game => {
				assert.strictEqual(
					Game.creeps.worker!.reserveController(findContainer(Game) as unknown as StructureController),
					C.ERR_INVALID_TARGET);
			});
		}));

		test('range before no bodypart', () => neutralNoClaim(async ({ player }) => {
			await player('100', Game => {
				const controller = Game.rooms.W3N3!.controller!;
				assert.strictEqual(Game.creeps.distantWorker!.reserveController(controller), C.ERR_NOT_IN_RANGE);
			});
		}));

		test('invalid controller state before no bodypart', () => hostileNoClaim(async ({ player }) => {
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

		test('upgrade-blocked before range', () => upgradeBlockedOutOfRange(async ({ player }) => {
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

		test('one activation per tick across controllers', () => ownedTwoRooms(async ({ player, tick }) => {
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

		test('attackController emits no data', () => hostileReservation(async ({ player, tick }) => {
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

		test('reserveController emits amount', () => ownReservation(async ({ player, tick }) => {
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

		test('upgradeController emits amount and energySpent', () => upgradeSim(async ({ player, tick }) => {
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

	describe('room status side effects', () => {
		const reserveNeutral = simulate({
			W3N3: room => {
				room['#insertObject'](create(pos, [ C.CLAIM, C.MOVE ], 'claimer', '100'));
			},
		});

		test('reserve updates source.energyCapacity',
			() => reserveNeutral(async ({ peekRoom, player, tick }) => {
				await peekRoom('W3N3', room => {
					const source = room.find(C.FIND_SOURCES)[0];
					assert.ok(source, 'source should exist');
					assert.strictEqual(source.energyCapacity, C.SOURCE_ENERGY_NEUTRAL_CAPACITY);
				});
				await player('100', Game => {
					assert.strictEqual(Game.creeps.claimer?.reserveController(Game.rooms.W3N3!.controller!), C.OK);
				});
				await tick();
				await peekRoom('W3N3', room => {
					const source = room.find(C.FIND_SOURCES)[0];
					assert.strictEqual(source?.energyCapacity, C.SOURCE_ENERGY_CAPACITY);
				});
			}));

		const downgradeWithExtension = simulate({
			W3N3: room => {
				room['#level'] = 8;
				room['#user'] = room.controller!['#user'] = '100';
				room.controller!['#downgradeTime'] = 1;
				room['#insertObject'](createExtension(new RoomPosition(32, 32, 'W3N3'), 8, '100'));
			},
		});

		test('downgrade updates extension.energyCapacity',
			() => downgradeWithExtension(async ({ peekRoom, tick }) => {
				await peekRoom('W3N3', room => {
					const [ extension ] = lookForStructures(room, C.STRUCTURE_EXTENSION);
					assert.ok(extension, 'extension should exist');
					assert.strictEqual(extension.energyCapacity, C.EXTENSION_ENERGY_CAPACITY[8]);
				});
				await tick();
				await peekRoom('W3N3', room => {
					assert.strictEqual(room.controller!.level, 7);
					const [ extension ] = lookForStructures(room, C.STRUCTURE_EXTENSION);
					assert.ok(extension, 'extension should still exist');
					assert.strictEqual(extension.energyCapacity, C.EXTENSION_ENERGY_CAPACITY[7]);
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

		test('level-up delivers a notification', () => onCuspOfLevelUp(async ({ player, tick }) => {
			using capture = captureNotificationsForTesting();
			await player('100', Game => {
				Game.creeps.worker?.upgradeController(Game.rooms.W3N3!.controller!);
			});
			// Notification is queued on the first processed tick (time=0) and drained that same tick.
			await tick();
			const [ row ] = capture.rows.filter(row => row.message.includes('upgraded to level'));
			assert.ok(row, 'expected level-up notification');
			assert.strictEqual(row.message, 'Your Controller in room W3N3 has been upgraded to level 2.');
			assert.strictEqual(row.type, 'msg');
		}));

		// ticksToDowngrade hits exactly 3000 on the second processed tick (Game.time = 2). The
		// owned controller keeps the room processing every tick, so a window-based warning would
		// re-fire each tick and fail the "exactly once" count.
		const aboutToWarn = simulate({
			W3N3: room => {
				room['#user'] = '100';
				room['#level'] = 5;
				room.controller!['#user'] = '100';
				room.controller!['#downgradeTime'] = 2 + 3000;
			},
		});

		test('pre-downgrade warning delivered exactly once',
			() => aboutToWarn(async ({ tick }) => {
				using capture = captureNotificationsForTesting();
				// Warning is queued on tick 2; the delivery worker drains it at the time=10 cadence.
				await tick(11);
				const warnings = capture.rows.filter(row => row.message.includes('will be downgraded'));
				const total = warnings.reduce((sum, row) => sum + row.count, 0);
				assert.strictEqual(total, 1, 'warning should fire exactly once even when room stays active');
				const [ warning ] = warnings;
				assert.ok(warning);
				assert.strictEqual(warning.message,
					'Attention! Your Controller in room W3N3 will be downgraded to level 4 in 3000 ticks (~2 hours)! ' +
					'Upgrade it to prevent losing of this room. ' +
					"<a href='http://support.screeps.com/hc/en-us/articles/203086021-Territory-control'>Learn more</a>");
				assert.strictEqual(warning.type, 'msg');
			}));

		// Controller downgrades on the first processed tick (Game.time = 1).
		const aboutToDowngrade = simulate({
			W3N3: room => {
				room['#user'] = '100';
				room['#level'] = 5;
				room.controller!['#user'] = '100';
				room.controller!['#downgradeTime'] = 1;
			},
		});

		test('downgrade delivers the new level', () => aboutToDowngrade(async ({ tick }) => {
			using capture = captureNotificationsForTesting();
			await tick();
			const [ row ] = capture.rows.filter(row => row.message.includes('has been downgraded'));
			assert.ok(row, 'expected downgrade notification');
			assert.strictEqual(row.message,
				'Your Controller in room W3N3 has been downgraded to level 4 due to absence of upgrading activity!');
			assert.strictEqual(row.type, 'msg');
		}));

		test('pre-downgrade warning re-arms after downgrade',
			() => aboutToDowngrade(async ({ tick, poke, shard }) => {
				using capture = captureNotificationsForTesting();
				// Drop the per-user throttle so the re-armed warning delivers alongside the downgrade.
				await setNotifyPrefs(shard.db, '100', { interval: 0 });
				await tick();
				// Re-arm: place downgradeTime back on the warn boundary for the next processed tick (Game.time = 2).
				await poke('W3N3', undefined, (_Game, room) => {
					room.controller!['#downgradeTime'] = 2 + 3000;
				});
				await tick(10);
				const downgrades = capture.rows.filter(row => row.message.includes('has been downgraded'));
				const warnings = capture.rows.filter(row => row.message.includes('will be downgraded'));
				const downgradeTotal = downgrades.reduce((sum, row) => sum + row.count, 0);
				const warningTotal = warnings.reduce((sum, row) => sum + row.count, 0);
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
