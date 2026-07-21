import type { SectorControl } from './schema.js';
import * as assert from 'node:assert';
import { Fn } from 'xxscreeps/functional/fn.js';
import { testWorld } from 'xxscreeps/test/import.js';
import { describe, test } from 'xxscreeps/test/index.js';
import { computeRoomMeta, iterateSectors, makeSectorRadiusPredicate } from './sector.js';

// Every room in the W/N quadrant corner of the given size — e.g. 21 spans W0..W20 x N0..N20.
function roomQuadrant(size: number): ReadonlySet<string> {
	return new Set(Fn.pipe(
		Fn.range(size),
		$$ => Fn.transform($$, xx => Fn.map(Fn.range(size), yy => `W${xx}N${yy}`)),
	));
}

describe('mods/modern/sector', () => {
	//
	// computeRoomMeta

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

	//
	// makeSectorRadiusPredicate
	test('a single-sector room belongs wholly to its sector', () => {
		const inSector = makeSectorRadiusPredicate('W5N5', 'W10N10', [ 'W5N5' ]);
		assert.ok(inSector(0, 0), 'even the far corner is claimed');
	});

	test('a shared edge room splits between its two sectors', () => {
		// W10N5 sits between W5N5 (east) and W15N5 (west).
		const sectors = [ 'W5N5', 'W15N5' ];
		const east = makeSectorRadiusPredicate('W5N5', 'W10N5', sectors);
		const west = makeSectorRadiusPredicate('W15N5', 'W10N5', sectors);
		assert.ok(east(49, 25), 'the east half belongs to W5N5');
		assert.ok(!east(0, 25), 'the west half does not');
		assert.ok(west(0, 25), 'the west half belongs to W15N5');
		assert.ok(!west(49, 25), 'the east half does not');
		for (let xx = 0; xx < 50; ++xx) {
			assert.ok(!(east(xx, 25) && west(xx, 25)), `column ${xx} is claimed by at most one sector`);
		}
	});

	test('a shared corner room splits between its four sectors', () => {
		const sectors = [ 'W5N5', 'W15N5', 'W5N15', 'W15N15' ];
		const inSector = makeSectorRadiusPredicate('W5N5', 'W10N10', sectors);
		assert.ok(inSector(49, 49), 'the near quadrant belongs to W5N5');
		assert.ok(!inSector(0, 49), 'the far quadrants do not');
		assert.ok(!inSector(49, 0), 'the far quadrants do not');
		assert.ok(!inSector(0, 0), 'the far quadrants do not');
	});

	//
	// World sector metadata
	test('reads the stamped sector record', () => {
		// The test world is exactly W0..W10 x N0..N10 — one full sector.
		const sectors = [ ...iterateSectors(testWorld) ];
		assert.deepStrictEqual(sectors.map(([ center ]) => center), [ 'W5N5' ], 'W5N5 anchors the only sector');
		const { sectorControl } = testWorld.map['#getRoomTraits']('W5N5');
		assert.ok(sectorControl, 'the center room carries the record');
		assert.strictEqual(sectorControl.edges.length, 40);
		assert.strictEqual(sectorControl.members.length, 81);
		const edge = testWorld.map['#getRoomTraits']('W0N0');
		assert.strictEqual(edge.sectorControl, undefined, 'edge rooms carry no record');
	});

	test('inverts the records into room -> centers', () => {
		const { sectorControl } = testWorld.map['#getRoomTraits']('W5N5');
		assert.ok(sectorControl);
		for (const roomName of Fn.concat<string>([ sectorControl.members, sectorControl.edges ])) {
			const centers = testWorld.map['#getRoomTraits'](roomName).sectors;
			assert.deepStrictEqual(centers, [ 'W5N5' ], `${roomName} claims W5N5`);
		}
	});
});
