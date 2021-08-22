import { RoomPosition } from 'xxscreeps/game/position';
import { assert, describe, simulate, test } from 'xxscreeps/test';
import { create as createExtension } from 'xxscreeps/mods/spawn/extension';
import { create } from './road';

describe('Roads', () => {
	test('under obstacle', () => simulate({
		W0N0: room => {
			room['#insertObject'](createExtension(new RoomPosition(25, 25, 'W0N0'), 1, '100'));
			room['#insertObject'](create(new RoomPosition(25, 25, 'W0N0')));
		},
	})(({ withRoom }) => withRoom('W0N0', room => {
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
	})(({ withRoom }) => withRoom('W0N0', room => {
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
