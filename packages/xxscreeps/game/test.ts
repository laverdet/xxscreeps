import * as C from 'xxscreeps/game/constants/index.js';
import { create as createCreep } from 'xxscreeps/mods/creep/creep.js';
import { assert, describe, simulate, test } from 'xxscreeps/test/index.js';
import { RoomPosition } from './position.js';

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

describe('Room.toJSON', () => {
	const sim = simulate({
		// Creep owned by '100' grants the player vision into W1N1.
		W1N1: room => room['#insertObject'](
			createCreep(new RoomPosition(25, 25, room.name), [ C.MOVE ], 'observer', '100')),
	});

	test('tolerates null-valued properties during serialization', () => sim(async ({ player }) => {
		await player('100', Game => {
			const room = Game.rooms.W1N1;
			assert.ok(room);
			const snapshot = JSON.parse(JSON.stringify(room));
			assert.ok(snapshot);
		});
	}));
});
