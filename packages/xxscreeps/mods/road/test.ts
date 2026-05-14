import { RoomPosition } from 'xxscreeps/game/position.js';
import { create as createExtension } from 'xxscreeps/mods/spawn/extension.js';
import { LOOK_STRUCTURES } from 'xxscreeps/mods/structure/constants.js';
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

	test('path cost', () => simulate({
		W0N0: room => {
			room['#insertObject'](create(new RoomPosition(22, 23, 'W0N0')));
			room['#insertObject'](create(new RoomPosition(22, 24, 'W0N0')));
			room['#insertObject'](create(new RoomPosition(22, 25, 'W0N0')));
			room['#insertObject'](create(new RoomPosition(22, 26, 'W0N0'))); // swamp
			room['#insertObject'](create(new RoomPosition(23, 26, 'W0N0')));
			room['#insertObject'](create(new RoomPosition(24, 26, 'W0N0')));
		},
	})(({ peekRoom }) => peekRoom('W0N0', room => {
		// Follows roads, except corner road
		const path1 = room.findPath(new RoomPosition(21, 22, 'W0N0'), new RoomPosition(25, 26, 'W0N0'));
		assert.strictEqual(path1.length, 5);
		// Strongly prefers roads
		const path2 = room.findPath(new RoomPosition(21, 22, 'W0N0'), new RoomPosition(25, 26, 'W0N0'), { plainCost: 3 });
		assert.strictEqual(path2.length, 6);
		// Don't care about roads
		const path3 = room.findPath(new RoomPosition(21, 22, 'W0N0'), new RoomPosition(25, 26, 'W0N0'), { ignoreRoads: true });
		assert.strictEqual(path3.length, 4);
	})));
});

describe('Room.lookForAtArea', () => {
	test('asArray=false returns sparse map of raw objects (vanilla shape)', () => simulate({
		W0N0: room => {
			room['#insertObject'](create(new RoomPosition(25, 25, 'W0N0')));
		},
	})(({ peekRoom }) => peekRoom('W0N0', room => {
		type CellMap = Record<number, Record<number, { structureType: string }[]>>;
		const result = room.lookForAtArea(LOOK_STRUCTURES, 24, 24, 26, 26) as unknown as CellMap;
		const row24 = result[24];
		assert.ok(row24, 'rows pre-initialized for every y in range');
		assert.strictEqual(row24[24], undefined, 'cells without matches stay undefined');
		const cell = result[25]![25]!;
		assert.strictEqual(cell.length, 1);
		const entry = cell[0]!;
		assert.strictEqual(entry.structureType, 'road');
		assert.strictEqual(LOOK_STRUCTURES in entry, false, 'no wrapper key');
	})));
});
