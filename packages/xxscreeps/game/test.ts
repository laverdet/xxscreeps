import * as assert from 'node:assert';
import { search } from 'xxscreeps/driver/pathfinder.js';
import { describe, test } from 'xxscreeps/test/index.js';
import { RoomObject } from './object.js';
import { RoomPosition } from './position.js';

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
}

test('RoomPosition', () => {
	positionAssertions({ xx: 49, yy: 49, roomName: 'W0N0', packed: 2139042097 });
	positionAssertions({ xx: 0, yy: 0, roomName: 'E0S0', packed: -2139095040 });
	positionAssertions({ xx: 10, yy: 20, roomName: 'W3N7', packed: 2021394964 });
	positionAssertions({ xx: 30, yy: 40, roomName: 'E13S17', packed: -1853022680 });
	positionAssertions({ xx: 0, yy: 49, roomName: 'W127S127', packed: -16777167 });
	positionAssertions({ xx: 49, yy: 0, roomName: 'E127N127', packed: 16724224 });
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

describe('RoomObject', () => {
	// `effects` is a producer-only surface; it must not leak onto the base prototype.
	test('effects is not installed on the base prototype', () => {
		assert.equal('effects' in RoomObject.prototype, false);
	});
});
