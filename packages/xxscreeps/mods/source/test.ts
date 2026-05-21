import type { Source } from './source.js';
import * as C from 'xxscreeps/game/constants/index.js';
import { RoomPosition } from 'xxscreeps/game/position.js';
import { create as createCreep } from 'xxscreeps/mods/creep/creep.js';
import { create as createObserver } from 'xxscreeps/mods/observer/observer.js';
import { lookForStructures } from 'xxscreeps/mods/structure/structure.js';
import { assert, describe, simulate, test } from 'xxscreeps/test/index.js';

describe('Source harvest validation', () => {
	const depletedOutOfRange = simulate({
		W1N1: room => {
			const source = room.find(C.FIND_SOURCES)[0]!;
			source.energy = 0;
			room['#insertObject'](createCreep(new RoomPosition(25, 25, room.name), [ C.WORK, C.CARRY, C.MOVE ], 'harvester', '100'));
		},
	});

	test('HARVEST-015:depleted-before-range', () => depletedOutOfRange(async ({ player }) => {
		await player('100', Game => {
			const creep = Game.creeps.harvester;
			const source = Game.rooms.W1N1?.find(C.FIND_SOURCES)[0];
			assert.ok(creep);
			assert.ok(source);
			assert.strictEqual(creep.harvest(source), C.ERR_NOT_ENOUGH_RESOURCES);
		});
	}));

	const depletedHostileRoom = simulate({
		W1N1: room => {
			const source = room.find(C.FIND_SOURCES)[0]!;
			source.energy = 0;
			room['#user'] = room.controller!['#user'] = '101';
			room['#insertObject'](createCreep(new RoomPosition(source.pos.x - 1, source.pos.y, room.name), [ C.WORK, C.CARRY, C.MOVE ], 'harvester', '100'));
		},
	});

	test('HARVEST-015:depleted-before-hostile-room', () => depletedHostileRoom(async ({ player }) => {
		await player('100', Game => {
			const creep = Game.creeps.harvester;
			const source = Game.rooms.W1N1?.find(C.FIND_SOURCES)[0];
			assert.ok(creep);
			assert.ok(source);
			assert.strictEqual(creep.harvest(source), C.ERR_NOT_ENOUGH_RESOURCES);
		});
	}));

	const noBodypartInvalidTarget = simulate({
		W1N1: room => {
			room['#insertObject'](createCreep(new RoomPosition(25, 25, room.name), [ C.CARRY, C.MOVE ], 'harvester', '100'));
		},
	});

	test('HARVEST-015:no-bodypart-before-invalid-target', () => noBodypartInvalidTarget(async ({ player }) => {
		await player('100', Game => {
			const creep = Game.creeps.harvester;
			assert.ok(creep);
			assert.strictEqual(creep.harvest(null as unknown as Source), C.ERR_NO_BODYPART);
		});
	}));
});

describe('Source cold-start wake repair', () => {
	const dormantSource = simulate({
		W1N1: room => {
			room['#insertObject'](createObserver(new RoomPosition(25, 25, 'W1N1'), '100'));
			room['#level'] = 8;
			room['#user'] = '100';
			room.controller!['#user'] = '100';
		},
		W2N2: room => {
			const source = room.find(C.FIND_SOURCES)[0]!;
			source.energy = 0;
			source['#nextRegenerationTime'] = 5;
		},
	});

	test('dormant source survives inter-room intent past its regen target', () =>
		dormantSource(async ({ peekRoom, player, shard, tick }) => {
			const startTime = shard.time;
			await shard.copyRoomFromPreviousTick('W2N2', startTime + 1);

			// Drift past #nextRegenerationTime. W2N2 has no players, so without
			// cold-start wake repair it stays out of every tracking set and the
			// regen target rots in the saved blob.
			await tick(10);
			assert.strictEqual(shard.time, startTime + 10);

			await player('100', Game => {
				const observer = lookForStructures(Game.rooms.W1N1, C.STRUCTURE_OBSERVER)[0];
				assert.strictEqual(observer?.observeRoom('W2N2'), C.OK);
			});
			// Pre-fix: throws here. finalize-extra runs the source's Tick
			// handler past the regen target and requiredExpiryTime blows up.
			await tick();

			await peekRoom('W2N2', room => {
				const source = room.find(C.FIND_SOURCES)[0]!;
				assert.strictEqual(source.energy, source.energyCapacity,
					'source refilled on cold-start catch-up wake');
				assert.strictEqual(source['#nextRegenerationTime'], 0,
					'regen target cleared after refill');
			});
		}));
});
