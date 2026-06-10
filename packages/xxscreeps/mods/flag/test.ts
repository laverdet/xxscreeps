import type { Color } from './flag.js';
import type { Dictionary } from 'xxscreeps/utility/types.js';
import * as C from 'xxscreeps/game/constants/index.js';
import { RoomPosition } from 'xxscreeps/game/position.js';
import { assert, describe, test } from 'xxscreeps/test/index.js';
import { Flag, checkCreateFlag } from './flag.js';

describe('Flag', () => {
	describe('checkCreateFlag precedence', () => {
		const pos = new RoomPosition(25, 25, 'W1N1');
		const validColor = C.COLOR_RED;
		const invalidColor = -1 as Color;
		const longName = 'X'.repeat(101);
		const fullFlags = (extra?: string): Dictionary<Flag> => {
			const flags: Dictionary<Flag> = {};
			for (let ii = 0; ii < C.FLAGS_LIMIT; ++ii) {
				flags[`Flag${ii}`] = undefined;
			}
			if (extra !== undefined) {
				flags[extra] = undefined;
			}
			return flags;
		};

		test('cap-full fires before invalid color', () => {
			const result = checkCreateFlag(fullFlags(), pos, 'Flag', invalidColor, validColor, true);
			assert.strictEqual(result, C.ERR_FULL);
		});

		test('cap-full fires before name-exists', () => {
			const result = checkCreateFlag(fullFlags(), pos, 'Flag0', validColor, validColor, true);
			assert.strictEqual(result, C.ERR_FULL);
		});

		test('cap-full fires before invalid name length', () => {
			const result = checkCreateFlag(fullFlags(longName), pos, longName, validColor, validColor, true);
			assert.strictEqual(result, C.ERR_FULL);
		});

		test('name-exists fires before invalid name length', () => {
			const flags: Dictionary<Flag> = { [longName]: undefined };
			const result = checkCreateFlag(flags, pos, longName, validColor, validColor, true);
			assert.strictEqual(result, C.ERR_NAME_EXISTS);
		});
	});
});
