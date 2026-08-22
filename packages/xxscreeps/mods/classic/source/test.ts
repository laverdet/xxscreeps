import type { Source } from './source.js';
import { Fn } from 'xxscreeps/functional/fn.js';
import { instanceOfPredicate } from 'xxscreeps/functional/predicate.js';
import { RoomPosition, iterateAllPositions } from 'xxscreeps/game/position.js';
import { isBorder } from 'xxscreeps/game/terrain.js';
import { create as createCreep } from 'xxscreeps/mods/classic/creep/creep.js';
import { exportPayload, importPayload } from 'xxscreeps/scripts/payload.js';
import { assert, describe, simulate, test } from 'xxscreeps/test/index.js';
import * as C from 'xxscreeps:mods/constants';
import { kSourceKeeperUserId } from './game.js';
import { StructureKeeperLair, create as createKeeperLair } from './keeper-lair.js';

describe('mods/classic/source', () => {
	const depletedOutOfRange = simulate({
		W1N1: room => {
			const source = room.find(C.FIND_SOURCES)[0]!;
			source.energy = 0;
			room['#insertObject'](createCreep(new RoomPosition(25, 25, room.name), [ C.WORK, C.CARRY, C.MOVE ], 'harvester', '100'));
		},
	});

	test('harvest depleted before range', () => depletedOutOfRange(async ({ player }) => {
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

	test('harvest depleted before hostile room', () => depletedHostileRoom(async ({ player }) => {
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

	test('harvest no bodypart before invalid target', () => noBodypartInvalidTarget(async ({ player }) => {
		await player('100', Game => {
			const creep = Game.creeps.harvester;
			assert.ok(creep);
			assert.strictEqual(creep.harvest(null as unknown as Source), C.ERR_NO_BODYPART);
		});
	}));

	const guardedRoom = simulate({
		W6N6: room => {
			const terrain = room.getTerrain();
			const position = Fn.find(iterateAllPositions(room.name), pos =>
				!isBorder(pos.x, pos.y) && terrain.get(pos.x, pos.y) === C.TERRAIN_MASK_WALL);
			assert.ok(position);
			room['#insertObject'](createKeeperLair(position));
		},
	});

	test('payload round trip', () => guardedRoom(async ({ shard }) => {
		const payload = await exportPayload(shard);
		assert.ok(payload.W6N6?.layout.some(line => line.includes('K')));
		const { rooms } = importPayload(payload);
		const keeperLair = Fn.find(
			rooms.find(room => room.name === 'W6N6')?.['#objects'] ?? [],
			instanceOfPredicate(StructureKeeperLair));
		assert.strictEqual(keeperLair?.['#user'], kSourceKeeperUserId);
	}));
});
