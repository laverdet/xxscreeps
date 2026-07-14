import type { Source } from './source.js';
import * as C from 'xxscreeps/game/constants/index.js';
import { RoomPosition } from 'xxscreeps/game/position.js';
import { create as createCreep } from 'xxscreeps/mods/classic/creep/creep.js';
import { assert, describe, simulate, test } from 'xxscreeps/test/index.js';

describe('mod/classic/source', () => {
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
});
