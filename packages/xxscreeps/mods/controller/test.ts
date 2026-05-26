import type { GameConstructor } from 'xxscreeps/game/index.js';
import * as C from 'xxscreeps/game/constants/index.js';
import { RoomPosition } from 'xxscreeps/game/position.js';
import { create } from 'xxscreeps/mods/creep/creep.js';
import { create as createContainer } from 'xxscreeps/mods/resource/container.js';
import { StructureExtension, create as createExtension } from 'xxscreeps/mods/spawn/extension.js';
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

	describe('room status side effects', () => {

		const reserveNeutral = simulate({
			W3N3: room => {
				room['#insertObject'](create(pos, [ C.CLAIM, C.MOVE ], 'claimer', '100'));
			},
		});

		test('reserveController updates source.energyCapacity via #roomStatusDidChange',
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
					const source = room.find(C.FIND_SOURCES)[0]!;
					assert.strictEqual(source.energyCapacity, C.SOURCE_ENERGY_CAPACITY);
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

		test('downgrade updates extension.energyCapacity via #roomStatusDidChange',
			() => downgradeWithExtension(async ({ peekRoom, tick }) => {
				await peekRoom('W3N3', room => {
					const ext = room.find(C.FIND_STRUCTURES)
						.find((s): s is StructureExtension => s instanceof StructureExtension);
					assert.ok(ext, 'extension should exist');
					assert.strictEqual(ext.energyCapacity, C.EXTENSION_ENERGY_CAPACITY[8]);
				});
				await tick();
				await peekRoom('W3N3', room => {
					assert.strictEqual(room.controller!.level, 7);
					const ext = room.find(C.FIND_STRUCTURES)
						.find((s): s is StructureExtension => s instanceof StructureExtension);
					assert.ok(ext, 'extension should still exist');
					assert.strictEqual(ext.energyCapacity, C.EXTENSION_ENERGY_CAPACITY[7]);
				});
			}));
	});
});
