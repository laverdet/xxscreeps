import { hooks } from 'xxscreeps/game/index.js';
import { assert, describe, test } from 'xxscreeps/test/index.js';
import { RoomPosition } from './position.js';

// Replay driver/runtime/index.ts: last-registered runtimeConnector hook runs last.
for (const hook of [ ...hooks.map('runtimeConnector') ].reverse()) {
	hook.initialize?.({} as never);
}

describe('RoomPosition', () => {
	test('__packedPos setter round-trips through the getter', () => {
		const cases: [number, number, string][] = [
			[ 0, 0, 'W0N0' ],
			[ 25, 25, 'W1N1' ],
			[ 49, 49, 'E5S5' ],
			[ 13, 7, 'E0S0' ],
		];
		for (const [ xx, yy, roomName ] of cases) {
			const original = new RoomPosition(xx, yy, roomName);
			const target = new RoomPosition(0, 0, 'W0N0');
			target.__packedPos = original.__packedPos;
			assert.strictEqual(target.x, original.x);
			assert.strictEqual(target.y, original.y);
			assert.strictEqual(target.roomName, original.roomName);
			assert.strictEqual(target.__packedPos, original.__packedPos);
		}
	});
});
