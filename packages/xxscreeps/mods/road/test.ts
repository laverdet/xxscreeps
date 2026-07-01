import { LOOK_TERRAIN } from 'xxscreeps/game/constants/find.js';
import * as C from 'xxscreeps/game/constants/index.js';
import { RoomPosition } from 'xxscreeps/game/position.js';
import { create as createCreep } from 'xxscreeps/mods/creep/creep.js';
import { create as createExtension } from 'xxscreeps/mods/spawn/extension.js';
import { LOOK_STRUCTURES } from 'xxscreeps/mods/structure/constants.js';
import { lookForStructureAt } from 'xxscreeps/mods/structure/structure.js';
import { assert, describe, simulate, test } from 'xxscreeps/test/index.js';
import { create } from './road.js';

describe('Roads', () => {
	test('under obstacle', () => simulate({
		W0N0: room => {
			room['#insertObject'](createExtension(new RoomPosition(25, 25, 'W0N0'), 1, '100'));
			room['#insertObject'](create(new RoomPosition(25, 25, 'W0N0')));
		},
	})(({ peekRoom }) => peekRoom('W0N0', room => {
		const path = room.findPath(new RoomPosition(24, 24, 'W0N0'), new RoomPosition(26, 26, 'W0N0'));
		assert.strictEqual(path.length, 3);
	})));

	test('wear-out does not push decay time past Game.time', () => simulate({
		W0N0: room => {
			const stomper = createCreep(new RoomPosition(25, 25, 'W0N0'), Array.from({ length: 50 }, () => C.MOVE), 'stomper', '100');
			room['#insertObject'](stomper);
			const road = create(new RoomPosition(26, 25, 'W0N0'));
			// Wear-out per step is ROAD_WEAROUT * body.length = 50, larger than what's left.
			road['#nextDecayTime'] = 30;
			room['#insertObject'](road);
		},
	})(async ({ player, tick, peekRoom }) => {
		await player('100', Game => {
			Game.creeps.stomper?.move(C.RIGHT);
		});
		await tick();
		await peekRoom('W0N0', room => {
			const road = lookForStructureAt(room, new RoomPosition(26, 25, 'W0N0'), C.STRUCTURE_ROAD);
			assert.ok(road, 'road survives the stomp');
			assert.ok(road.ticksToDecay);
		});
	}));

	test('path cost', () => simulate({
		W0N0: room => {
			// "U" shape
			room['#insertObject'](create(new RoomPosition(20, 12, 'W0N0')));
			room['#insertObject'](create(new RoomPosition(20, 13, 'W0N0')));
			room['#insertObject'](create(new RoomPosition(20, 14, 'W0N0')));
			room['#insertObject'](create(new RoomPosition(20, 15, 'W0N0')));
			room['#insertObject'](create(new RoomPosition(21, 16, 'W0N0')));
			room['#insertObject'](create(new RoomPosition(22, 16, 'W0N0')));
			room['#insertObject'](create(new RoomPosition(22, 16, 'W0N0')));
			room['#insertObject'](create(new RoomPosition(22, 16, 'W0N0')));
			room['#insertObject'](create(new RoomPosition(25, 15, 'W0N0')));
			room['#insertObject'](create(new RoomPosition(25, 14, 'W0N0')));
			room['#insertObject'](create(new RoomPosition(25, 13, 'W0N0')));
			room['#insertObject'](create(new RoomPosition(25, 12, 'W0N0')));
			// Shortcut with piece missing
			room['#insertObject'](create(new RoomPosition(21, 14, 'W0N0')));
			room['#insertObject'](create(new RoomPosition(22, 14, 'W0N0')));
			room['#insertObject'](create(new RoomPosition(22, 14, 'W0N0')));
			room['#insertObject'](create(new RoomPosition(24, 14, 'W0N0')));
		},
	})(({ peekRoom }) => peekRoom('W0N0', room => {
		// Follows roads, takes the shortcut
		const path1 = room.findPath(new RoomPosition(19, 11, 'W0N0'), new RoomPosition(26, 11, 'W0N0'));
		assert.strictEqual(path1.length, 8);
		// Strongly prefers roads, ignores shortcut
		const path2 = room.findPath(new RoomPosition(19, 11, 'W0N0'), new RoomPosition(26, 11, 'W0N0'), { plainCost: 3 });
		assert.strictEqual(path2.length, 9);
		// Don't care about roads
		const path3 = room.findPath(new RoomPosition(19, 11, 'W0N0'), new RoomPosition(26, 11, 'W0N0'), { ignoreRoads: true });
		assert.strictEqual(path3.length, 7);
	})));
});

describe('Room.lookForAtArea', () => {
	test('asArray=false returns sparse map of raw objects (vanilla shape)', () => simulate({
		W0N0: room => {
			room['#insertObject'](create(new RoomPosition(25, 25, 'W0N0')));
		},
	})(({ peekRoom }) => peekRoom('W0N0', room => {
		const result = room.lookForAtArea(LOOK_STRUCTURES, 24, 24, 26, 26) as unknown as
			Record<number, Record<number, { structureType: string }[]>>;
		assert.ok(result[24], 'rows pre-initialized for every y in range');
		assert.strictEqual(result[24][24], undefined, 'cells without matches stay undefined');
		const matches = result[25]?.[25];
		assert.deepStrictEqual(matches?.map(structure => structure.structureType), [ 'road' ]);
		assert.strictEqual(LOOK_STRUCTURES in matches[0]!, false, 'cells hold raw objects, no wrapper key');
	})));

	test('asArray=false LOOK_TERRAIN extracts the terrain string into the cell', () => simulate({})(({ peekRoom }) => peekRoom('W0N0', room => {
		const result = room.lookForAtArea(LOOK_TERRAIN, 10, 10, 10, 10) as unknown as
			Record<number, Record<number, string[]>>;
		assert.strictEqual(result[10]?.[10]?.length, 1);
		assert.ok([ 'plain', 'swamp', 'wall' ].includes(result[10][10][0]!));
	})));
});

describe('Room.lookAtArea', () => {
	test('asArray=false cells wrap entries without spurious x/y keys', () => simulate({
		W0N0: room => {
			room['#insertObject'](create(new RoomPosition(25, 25, 'W0N0')));
		},
	})(({ peekRoom }) => peekRoom('W0N0', room => {
		const cell = (room.lookAtArea(25, 25, 25, 25) as unknown as
			Record<number, Record<number, { type: string }[]>>)[25]![25]!;
		assert.deepStrictEqual(cell.map(entry => entry.type).sort(), [ 'structure', 'terrain' ]);
		for (const entry of cell) {
			assert.strictEqual('x' in entry, false);
			assert.strictEqual('y' in entry, false);
		}
	})));
});
