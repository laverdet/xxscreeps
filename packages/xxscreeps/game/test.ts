import * as assert from 'node:assert';
import { search } from 'xxscreeps/driver/pathfinder/pathfinder.js';
import { describe, test } from 'xxscreeps/test/index.js';
import { RoomPosition } from './position.js';
import { isHighwayRoom, sectorsForRoom } from './room/sector.js';

interface PositionAssertion {
	xx: number;
	yy: number;
	roomName: string;
	packed: number;
}

function positionAssertions(manifest: PositionAssertion) {
	const pos = new RoomPosition(manifest.xx, manifest.yy, manifest.roomName);
	assert.equal(pos.x, manifest.xx);
	assert.equal(pos.x, manifest.xx);
	assert.equal(pos.y, manifest.yy);
	assert.equal(pos.roomName, manifest.roomName);
	assert.equal(pos.__packedPos, manifest.packed);
	// try packed setter
	const packed = new RoomPosition(0, 0, 'W0N0');
	packed.__packedPos = manifest.packed;
	assert.equal(packed.x, manifest.xx);
	assert.equal(packed.y, manifest.yy);
	assert.equal(packed.roomName, manifest.roomName);
	// try attribute setter
	const next = new RoomPosition(0, 0, 'W0N0');
	next.x = manifest.xx;
	next.y = manifest.yy;
	next.roomName = manifest.roomName;
	assert.equal(next.__packedPos, manifest.packed);
	// wasm bindings build positions via `Object.create` + `__packedPos`, never the constructor
	const foreign = Object.create(RoomPosition.prototype) as RoomPosition;
	foreign.__packedPos = manifest.packed;
	assert.equal(foreign.x, manifest.xx);
	assert.equal(foreign.y, manifest.yy);
	assert.equal(foreign.roomName, manifest.roomName);
}

test('RoomPosition', () => {
	positionAssertions({ xx: 49, yy: 49, roomName: 'W0N0', packed: 2139042097 });
	positionAssertions({ xx: 0, yy: 0, roomName: 'E0S0', packed: -2139095040 });
	positionAssertions({ xx: 10, yy: 20, roomName: 'W3N7', packed: 2021394964 });
	positionAssertions({ xx: 30, yy: 40, roomName: 'E13S17', packed: -1853022680 });
	positionAssertions({ xx: 0, yy: 49, roomName: 'W127S127', packed: -16777167 });
	positionAssertions({ xx: 49, yy: 0, roomName: 'E127N127', packed: 16724224 });
});

describe('isHighwayRoom', () => {
	test('pins highway rooms against the sector modulus', () => {
		// Highways are the signed `%10===0` ring around each sector center.
		for (const roomName of [ 'W0N0', 'W0N5', 'W10N0', 'W5N0', 'E0S5', 'E10S0', 'E0N0' ]) {
			assert.ok(isHighwayRoom(roomName), `${roomName} should be a highway room`);
		}
		// Sector centers (`%10===5`) and interior rooms are not highways.
		for (const roomName of [ 'W5N5', 'E5S5', 'W3N4', 'W2N2', 'E7S2' ]) {
			assert.ok(!isHighwayRoom(roomName), `${roomName} should not be a highway room`);
		}
	});

	test('agrees with sectorsForRoom across a swept range', () => {
		// A room is a highway iff it sits on some sector's edge ring, which is exactly what
		// `sectorsForRoom` enumerates. Sweep across multiple sectors in every quadrant.
		for (let coord = 0; coord <= 20; ++coord) {
			for (let other = 0; other <= 20; ++other) {
				for (const roomName of [ `W${coord}N${other}`, `E${coord}S${other}`, `W${coord}S${other}`, `E${coord}N${other}` ]) {
					assert.strictEqual(
						isHighwayRoom(roomName), [ ...sectorsForRoom(roomName) ].length > 0,
						`${roomName}: isHighwayRoom must match sectorsForRoom membership`);
				}
			}
		}
	});
});

describe('PathFinder', () => {
	test('inaccessible room', () => {
		const origin = new RoomPosition(25, 25, 'W1N1');
		const destination = new RoomPosition(26, 26, 'W1N1');
		const roomCallback = (): false => false;
		const result = search(origin, [ destination ], { roomCallback });
		assert.deepStrictEqual(result, {
			cost: 0,
			incomplete: true,
			ops: 0,
			path: [],
		});
	});

	test('origin is goal', () => {
		const origin = new RoomPosition(25, 25, 'W1N1');
		const destination = new RoomPosition(25, 25, 'W1N1');
		const roomCallback = () => { throw new Error('roomCallback should not be invoked'); };
		const result = search(origin, [ destination ], { roomCallback });
		assert.deepStrictEqual(result, {
			cost: 0,
			incomplete: false,
			ops: 0,
			path: [],
		});
	});
});
