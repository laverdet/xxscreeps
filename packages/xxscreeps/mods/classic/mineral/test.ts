import { Fn } from 'xxscreeps/functional/fn.js';
import { instanceOfPredicate } from 'xxscreeps/functional/predicate.js';
import { Game } from 'xxscreeps/game/index.js';
import { RoomPosition } from 'xxscreeps/game/position.js';
import { create as createCreep } from 'xxscreeps/mods/classic/creep/creep.js';
import { exportPayload, importPayload } from 'xxscreeps/scripts/payload.js';
import { assert, describe, simulate, test } from 'xxscreeps/test/index.js';
import * as C from 'xxscreeps:mods/constants';
import { StructureExtractor, create as createExtractor } from './extractor.js';
import { Mineral } from './mineral.js';

describe('mods/classic/mineral', () => {
	const depletedOutOfRange = simulate({
		W6N1: room => {
			const mineral = room.find(C.FIND_MINERALS)[0]!;
			mineral.mineralAmount = 0;
			room['#insertObject'](createCreep(new RoomPosition(25, 25, room.name), [ C.WORK, C.CARRY, C.MOVE ], 'harvester', '100'));
		},
	});

	test('harvest depleted before range', () => depletedOutOfRange(async ({ player }) => {
		await player('100', Game => {
			const creep = Game.creeps.harvester;
			const mineral = Game.rooms.W6N1?.find(C.FIND_MINERALS)[0];
			assert.ok(creep);
			assert.ok(mineral);
			assert.strictEqual(creep.harvest(mineral), C.ERR_NOT_ENOUGH_RESOURCES);
		});
	}));

	const noBodypartInvalidTarget = simulate({
		W6N1: room => {
			room['#insertObject'](createCreep(new RoomPosition(25, 25, room.name), [ C.CARRY, C.MOVE ], 'harvester', '100'));
		},
	});

	test('harvest no bodypart before invalid target', () => noBodypartInvalidTarget(async ({ player }) => {
		await player('100', Game => {
			const creep = Game.creeps.harvester;
			assert.ok(creep);
			assert.strictEqual(creep.harvest(null as unknown as Mineral), C.ERR_NO_BODYPART);
		});
	}));

	const onCooldown = simulate({
		W6N1: room => {
			const mineral = room.find(C.FIND_MINERALS)[0]!;
			const extractor = createExtractor(mineral.pos, '100');
			extractor['#cooldownTime'] = Game.time + Math.floor(C.EXTRACTOR_COOLDOWN / 2);
			room['#insertObject'](extractor);
			room['#insertObject'](createCreep(mineral.pos, [ C.WORK, C.CARRY, C.MOVE ], 'harvester', '100'));
			room['#level'] = 6;
			room['#user'] = room.controller!['#user'] = '100';
		},
	});

	test('harvest cooldown', () => onCooldown(async ({ player }) => {
		await player('100', Game => {
			const creep = Game.creeps.harvester;
			const mineral = Game.rooms.W6N1?.find(C.FIND_MINERALS)[0];
			assert.ok(creep);
			assert.ok(mineral);
			assert.strictEqual(creep.harvest(mineral), C.ERR_TIRED);
		});
	}));

	const prebuiltExtractor = simulate({
		W6N6: room => {
			const mineral = room.find(C.FIND_MINERALS)[0]!;
			room['#insertObject'](createExtractor(mineral.pos, null));
		},
		W6N1: room => {
			const mineral = room.find(C.FIND_MINERALS)[0]!;
			room['#insertObject'](createExtractor(mineral.pos, '100'));
			room['#user'] = room.controller!['#user'] = '100';
		},
	});

	test('payload round trip', () => prebuiltExtractor(async ({ shard }) => {
		const { payload, dropped } = await exportPayload(shard);
		// W6N6's neutral extractor rides the mineral's entry; only W6N1's owned one is left behind.
		assert.strictEqual(dropped.get('StructureExtractor'), 1);
		const extractorId = payload.W6N6?.objects?.find(object => object.extractor !== undefined)?.extractor;
		assert.ok(extractorId !== undefined);
		const { rooms } = importPayload(payload);
		const roomObjects = (roomName: string) =>
			rooms.find(room => room.name === roomName)?.['#objects'] ?? [];
		const objects = roomObjects('W6N6');
		const extractor = Fn.find(objects, instanceOfPredicate(StructureExtractor));
		const mineral = Fn.find(objects, instanceOfPredicate(Mineral));
		assert.ok(extractor);
		assert.strictEqual(extractor.id, extractorId);
		assert.strictEqual(extractor.hits, C.EXTRACTOR_HITS);
		assert.strictEqual(extractor['#user'], null);
		assert.strictEqual(extractor['#posId'], mineral?.['#posId']);
		assert.strictEqual(Fn.find(roomObjects('W6N1'), instanceOfPredicate(StructureExtractor)), undefined);
	}));
});
