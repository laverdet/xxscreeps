import type { SectorControl } from 'xxscreeps/game/map.js';
import * as assert from 'node:assert';
import { search } from 'xxscreeps/driver/pathfinder/pathfinder.js';
import { Fn } from 'xxscreeps/functional/fn.js';
import { world } from 'xxscreeps/test/import.js';
import { describe, test } from 'xxscreeps/test/index.js';
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

// Every room in the W/N quadrant corner of the given size — e.g. 21 spans W0..W20 x N0..N20.
function roomQuadrant(size: number): ReadonlySet<string> {
	return new Set(Fn.pipe(
		Fn.range(size),
		$$ => Fn.transform($$, xx => Fn.map(Fn.range(size), yy => `W${xx}N${yy}`)),
	));
}

describe('computeRoomMeta', () => {
	// A 2x2 block of sectors; the corner room W10N10 rings all four centers.
	const quadrant = roomQuadrant(21);

	test('anchors a sector record on its center room', () => {
		const { sectorControl } = computeRoomMeta('W5N5', quadrant);
		assert.ok(sectorControl, 'W5N5 anchors a sector');
		assert.strictEqual(sectorControl.edges.length, 40, 'the highway ring is 40 rooms');
		assert.strictEqual(sectorControl.members.length, 81, 'the interior is 81 rooms');
		assert.ok(sectorControl.members.includes('W5N5'), 'the center registers itself');
		assert.ok(sectorControl.members.includes('W4N4'), 'interior rooms are members');
		assert.ok(sectorControl.edges.includes('W0N5'), 'the ring includes a mid-edge room');
		assert.ok(sectorControl.edges.includes('W10N10'), 'the ring includes a corner room');
		const members = new Set(sectorControl.members);
		assert.ok(sectorControl.edges.every(name => !members.has(name)), 'edges and members are disjoint');
	});

	test('non-center rooms carry no record', () => {
		for (const roomName of [ 'W0N0', 'W0N5', 'W4N4', 'W2N3', 'W10N10' ]) {
			assert.strictEqual(computeRoomMeta(roomName, quadrant).sectorControl, undefined, `${roomName} is not a center`);
		}
	});

	test('edges are shared between sectors, members are exclusive', () => {
		const centers = [ 'W5N5', 'W15N5', 'W5N15', 'W15N15' ];
		const claims = (fn: (sector: SectorControl) => boolean) =>
			centers.filter(center => {
				const { sectorControl } = computeRoomMeta(center, quadrant);
				assert.ok(sectorControl);
				return fn(sectorControl);
			});
		assert.deepStrictEqual(claims(sector => sector.edges.includes('W10N10')), centers,
			'the corner room is registered to all 4 sectors');
		assert.deepStrictEqual(claims(sector => sector.edges.includes('W10N5')), [ 'W5N5', 'W15N5' ],
			'a mid-edge room is registered to 2 sectors');
		assert.deepStrictEqual(claims(sector => sector.members.includes('W12N13')), [ 'W15N15' ],
			'an interior room is registered to exactly one sector');
	});

	test('clips to the rooms present in the world', () => {
		// A world corner holding W5N5 but only part of its ring and interior.
		const clipped = roomQuadrant(6);
		const { sectorControl } = computeRoomMeta('W5N5', clipped);
		assert.ok(sectorControl);
		assert.strictEqual(sectorControl.edges.length, 11, 'ring clipped to the present W0/N0 arms');
		assert.strictEqual(sectorControl.members.length, 25, 'interior clipped to the present 5x5 corner');
		assert.ok(!sectorControl.edges.includes('W10N5'), 'absent ring rooms are clipped');
	});
});

describe('GameMap sector metadata', () => {
	test('reads the stamped sector record', () => {
		// The test world is exactly W0..W10 x N0..N10 — one full sector.
		const sectors = [ ...world.map['#sectors']() ];
		assert.deepStrictEqual(sectors.map(([ center ]) => center), [ 'W5N5' ], 'W5N5 anchors the only sector');
		const { sectorControl } = world.map['#getRoomTraits']('W5N5');
		assert.ok(sectorControl, 'the center room carries the record');
		assert.strictEqual(sectorControl.edges.length, 40);
		assert.strictEqual(sectorControl.members.length, 81);
		const edge = world.map['#getRoomTraits']('W0N0');
		assert.strictEqual(edge.sectorControl, undefined, 'edge rooms carry no record');
	});

	test('inverts the records into room -> centers', () => {
		const { sectorControl } = world.map['#getRoomTraits']('W5N5');
		assert.ok(sectorControl);
		for (const roomName of Fn.concat<string>([ sectorControl.members, sectorControl.edges ])) {
			const centers = world.map['#getRoomTraits'](roomName).sectors;
			assert.deepStrictEqual(centers, [ 'W5N5' ], `${roomName} claims W5N5`);
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
