import type { GameConstructor } from 'xxscreeps/game/index.js';
import { execFile } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import Loki from 'lokijs';
import * as C from 'xxscreeps/game/constants/index.js';
import { RoomPosition } from 'xxscreeps/game/position.js';
import { create } from 'xxscreeps/mods/creep/creep.js';
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

	function saveDatabase(loki: Loki) {
		const saved = Promise.withResolvers<undefined>();
		loki.saveDatabase(error => error ? saved.reject(error) : saved.resolve(undefined));
		return saved.promise;
	}

	function runImport(cwd: string, source: string) {
		const done = Promise.withResolvers<undefined>();
		execFile(process.execPath, [
			fileURLToPath(new URL('../../../bin/xxscreeps.js', import.meta.url)),
			'import',
			'--shard-only',
			source,
		], { cwd, timeout: 10000 }, error => error ? done.reject(error) : done.resolve(undefined));
		return done.promise;
	}

	async function writeImportFixture(file: string) {
		const loki = new Loki(file);
		loki.addCollection('env').insert({ data: { gameTime: 2 } });
		loki.addCollection('rooms').insert({ _id: 'W1N1' });
		loki.addCollection('rooms.terrain').insert({
			room: 'W1N1',
			terrain: '0'.repeat(2500),
		});
		loki.addCollection('rooms.objects').insert({
			_id: '100000000000000000000001',
			room: 'W1N1',
			type: 'controller',
			x: 25,
			y: 25,
			level: 0,
			safeMode: 0,
			user: null,
			isPowerEnabled: false,
			safeModeAvailable: 0,
			downgradeTime: 0,
			progress: 0,
			safeModeCooldown: 0,
			upgradeBlocked: 0,
		});
		await saveDatabase(loki);
	}

	test('xxscreeps import initializes controllers before flushing users', async () => {
		const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'xxscreeps-import-'));
		try {
			const source = path.join(cwd, 'db.json');
			await fs.writeFile(path.join(cwd, '.screepsrc.yaml'), `
database:
  data: local://issue207-db
  pubsub: local://issue207-pubsub
shards:
  - name: shard0
    data: local://issue207-shard
    pubsub: local://issue207-shard-pubsub
    scratch: local://issue207-scratch
`);
			await writeImportFixture(source);
			await runImport(cwd, source);
		} finally {
			await fs.rm(cwd, { force: true, recursive: true });
		}
	});

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
});
