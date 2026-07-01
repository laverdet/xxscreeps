import type { RoomType } from './room/sector.js';
import * as assert from 'node:assert';
import { search } from 'xxscreeps/driver/pathfinder/pathfinder.js';
import { world } from 'xxscreeps/test/import.js';
import { describe, test } from 'xxscreeps/test/index.js';
import { GameMap } from './map.js';
import { RoomPosition } from './position.js';
import { computeRoomMeta } from './room/sector.js';

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

describe('computeRoomMeta', () => {
	test('classifies the sector template', () => {
		const cases: [ string, RoomType ][] = [
			[ 'W0N0', 'highway' ], [ 'W5N0', 'highway' ], [ 'W10N5', 'highway' ], [ 'E0S7', 'highway' ],
			[ 'W5N5', 'center' ], [ 'E5S5', 'center' ],
			[ 'W4N4', 'sourceKeeper' ], [ 'W6N6', 'sourceKeeper' ], [ 'W4N6', 'sourceKeeper' ],
			[ 'W5N4', 'sourceKeeper' ], [ 'E6S5', 'sourceKeeper' ],
			[ 'W2N2', 'normal' ], [ 'W1N7', 'normal' ], [ 'E3S8', 'normal' ],
		];
		for (const [ roomName, expected ] of cases) {
			assert.strictEqual(computeRoomMeta(roomName).roomType, expected, `${roomName} should be ${expected}`);
		}
	});

	test('marks a room a highway exactly when it rings a sector', () => {
		// A room is a highway iff it sits on at least one sector's edge ring. Sweep every quadrant.
		for (let coord = 0; coord <= 20; ++coord) {
			for (let other = 0; other <= 20; ++other) {
				for (const roomName of [ `W${coord}N${other}`, `E${coord}S${other}`, `W${coord}S${other}`, `E${coord}N${other}` ]) {
					const { roomType, centers } = computeRoomMeta(roomName);
					assert.strictEqual(roomType === 'highway', centers.length > 0,
						`${roomName}: highway classification must match ring membership`);
				}
			}
		}
	});
});

describe('GameMap sector metadata', () => {
	test('inverts stamped centers into a sector\'s ring members', () => {
		assert.strictEqual(world.map.getRoomType('W5N5'), 'center');
		const members = world.map.getSectorMembers('W5N5');
		assert.strictEqual(members.length, 40, 'a sector ring is 40 rooms');
		assert.ok(members.includes('W0N5'), 'ring includes a mid-edge room');
		assert.ok(members.includes('W0N0'), 'ring includes a corner room');
		assert.ok(!members.includes('W5N5'), 'the center is not its own ring member');
		for (const member of members) {
			assert.ok(world.map.getSectorCenters(member).includes('W5N5'), `${member} claims W5N5 as a center`);
		}
	});

	test('recomputes geometry for rooms with no stored metadata', () => {
		// A world whose rooms carry no metadata (unstamped `roomType: undefined`) must fall back to
		// the template and land on exactly the stamped world's answers — stamped == computed.
		const unstampedTerrain: typeof world.terrain = new Map();
		for (const [ roomName, entry ] of world.terrain) {
			unstampedTerrain.set(roomName, { info: entry.info, meta: { roomType: undefined, centers: [] } });
		}
		const unstamped = new GameMap(unstampedTerrain);
		for (const [ roomName ] of world.terrain) {
			assert.strictEqual(world.map.getRoomType(roomName), unstamped.getRoomType(roomName), `${roomName}: roomType`);
			assert.deepStrictEqual(world.map.getSectorCenters(roomName), unstamped.getSectorCenters(roomName), `${roomName}: centers`);
		}
		assert.deepStrictEqual(
			[ ...world.map.getSectorMembers('W5N5') ].sort(),
			[ ...unstamped.getSectorMembers('W5N5') ].sort(),
			'ring members match under fallback');
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
