import type { ExitMap, GenerateRoomOptions, HighwayOrientation, RoomGeneratorContext } from './symbols.js';
import type { Shard } from 'xxscreeps/engine/db/index.js';
import type { RoomType } from 'xxscreeps/mods/modern/sector/terrain.js';
import { mappedNumericComparator } from 'xxscreeps/functional/comparator.js';
import { Fn } from 'xxscreeps/functional/fn.js';
import * as C from 'xxscreeps/game/constants/index.js';
import { makeLocalIterateInRangeTo } from 'xxscreeps/game/direction.js';
import * as MapSchema from 'xxscreeps/game/map.js';
import { RoomPosition, iterateArea, iterateNeighbors } from 'xxscreeps/game/position.js';
import { Room } from 'xxscreeps/game/room/index.js';
import { kMaxWorldSize, makeRoomName, makeSignedRoomName, parseRoomName, parseSignedRoomName } from 'xxscreeps/game/room/name.js';
import { flushUsers } from 'xxscreeps/game/room/room.js';
import { Terrain, TerrainWriter, isBorder, packExits } from 'xxscreeps/game/terrain.js';
import { computeRoomMeta, highwayOrientation, roomType } from 'xxscreeps/mods/modern/sector/terrain.js';
import { makeWriter } from 'xxscreeps/schema/write.js';
import { shuffledSquare } from 'xxscreeps/utility/random.js';
import { hashCombine, hashMix } from 'xxscreeps/utility/utility.js';
import { hooks } from './symbols.js';
import 'xxscreeps:mods/terrain';

export type { GenerateRoomOptions } from './symbols.js';

// The world's per-room terrain map, as returned by `shard.loadWorld()`. The generation entry points
// accumulate freshly built rooms into one of these and serialize it once, rather than once per room.
type WorldTerrain = Awaited<ReturnType<Shard['loadWorld']>>['terrain'];

interface TerrainTypeParams {
	fill: number;
	smooth: number;
	factor: number;
}

const wallTypes: Record<number, TerrainTypeParams> = {
	1: { fill: 0.4, smooth: 10, factor: 5 },
	2: { fill: 0.2, smooth: 20, factor: 4 },
	3: { fill: 0.2, smooth: 20, factor: 4 },
	4: { fill: 0.3, smooth: 18, factor: 4 },
	5: { fill: 0.3, smooth: 10, factor: 4 },
	6: { fill: 0.3, smooth: 10, factor: 4 },
	7: { fill: 0.3, smooth: 10, factor: 4 },
	8: { fill: 0.35, smooth: 15, factor: 4 },
	9: { fill: 0.3, smooth: 2, factor: 4 },
	10: { fill: 0.35, smooth: 2, factor: 4 },
	11: { fill: 0.35, smooth: 5, factor: 4 },
	12: { fill: 0.35, smooth: 5, factor: 4 },
	13: { fill: 0.25, smooth: 5, factor: 4 },
	14: { fill: 0.4, smooth: 3, factor: 5 },
	15: { fill: 0.5, smooth: 3, factor: 5 },
	16: { fill: 0.45, smooth: 4, factor: 5 },
	17: { fill: 0.45, smooth: 6, factor: 5 },
	18: { fill: 0.45, smooth: 10, factor: 5 },
	19: { fill: 0.5, smooth: 10, factor: 5 },
	20: { fill: 0.4, smooth: 3, factor: 5 },
	21: { fill: 0.5, smooth: 2, factor: 5 },
	22: { fill: 0.45, smooth: 4, factor: 5 },
	23: { fill: 0.45, smooth: 6, factor: 5 },
	24: { fill: 0.45, smooth: 10, factor: 5 },
	25: { fill: 0.5, smooth: 10, factor: 5 },
	26: { fill: 0.45, smooth: 10, factor: 5 },
	27: { fill: 0.45, smooth: 6, factor: 5 },
	28: { fill: 0.2, smooth: 20, factor: 4 },
};

const swampTypes: Record<number, TerrainTypeParams> = {
	1: { fill: 0.3, smooth: 3, factor: 5 },
	2: { fill: 0.35, smooth: 3, factor: 5 },
	3: { fill: 0.45, smooth: 3, factor: 5 },
	4: { fill: 0.25, smooth: 1, factor: 5 },
	5: { fill: 0.25, smooth: 30, factor: 4 },
	6: { fill: 0.52, smooth: 30, factor: 5 },
	7: { fill: 0.45, smooth: 3, factor: 5 },
	8: { fill: 0.3, smooth: 1, factor: 5 },
	9: { fill: 0.3, smooth: 1, factor: 4 },
	10: { fill: 0.3, smooth: 3, factor: 5 },
	11: { fill: 0.3, smooth: 3, factor: 5 },
	12: { fill: 0.3, smooth: 1, factor: 5 },
	13: { fill: 0.25, smooth: 1, factor: 5 },
	14: { fill: 0.35, smooth: 3, factor: 5 },
};

// Random generation rolls wall types 1-27; type 28 duplicates 2/3 and is reachable only by passing
// terrainType explicitly, never at random.
function randomWallType(): number {
	return Math.floor(Math.random() * 27) + 1;
}

interface Cell {
	wall: boolean;
	swamp: boolean;
	forceOpen: boolean;
}

type Grid = Cell[][];

// Yields the in-bounds tiles within Chebyshev `range` of (xx, yy) (the tile itself included), clamped
// to the 50x50 grid, so neighbour walks don't need their own bounds guards.
const iterateGridInRange = makeLocalIterateInRangeTo(0, 49);
const iterateRoomsInRange = makeLocalIterateInRangeTo(-Infinity, Infinity);

function makeGrid(): Grid {
	return Fn.pipe(
		Fn.range(50),
		$$ => Fn.map($$, () => Fn.pipe(
			Fn.range(50),
			$$ => Fn.map($$, (): Cell => ({ wall: false, swamp: false, forceOpen: false })),
			$$ => [ ...$$ ])),
		$$ => [ ...$$ ]);
}

function smoothTerrain(grid: Grid, factor: number, key: 'wall' | 'swamp'): Grid {
	const next = makeGrid();
	for (const [ yy, row ] of grid.entries()) {
		const nextRow = next[yy]!;
		for (const [ xx, cell ] of row.entries()) {
			const nextCell = nextRow[xx]!;
			Object.assign(nextCell, cell);

			let count = 0;
			for (let dyy = -1; dyy <= 1; dyy++) {
				for (let dxx = -1; dxx <= 1; dxx++) {
					const nxx = xx + dxx;
					const nyy = yy + dyy;
					const outOfBounds = nxx < 0 || nyy < 0 || nxx > 49 || nyy > 49;
					if (outOfBounds) {
						if (key === 'wall') count++;
					} else if (grid[nyy]![nxx]![key]) {
						count++;
					}
				}
			}
			nextCell[key] = count >= factor;

			if (key === 'wall') {
				if (isBorder(xx, yy)) {
					nextCell.wall = true;
				}
				if (cell.forceOpen) {
					nextCell.wall = false;
				}
			}
		}
	}
	return next;
}

function checkFlood(grid: Grid): boolean {
	let startXx = -1;
	let startYy = -1;

	outer: for (const [ xx, row ] of grid.entries()) {
		for (const [ yy, cell ] of row.entries()) {
			if (!cell.wall) {
				startXx = xx;
				startYy = yy;
				break outer;
			}
		}
	}

	if (startXx === -1) return false;

	const visited = Fn.pipe(
		Fn.range(50),
		$$ => Fn.map($$, () => [ ...Fn.map(Fn.range(50), () => false) ]),
		$$ => [ ...$$ ]);

	const stack = [ [ startXx, startYy ] as const ];
	visited[startYy]![startXx] = true;

	while (stack.length > 0) {
		const [ cxx, cyy ] = stack.pop()!;
		for (const [ nxx, nyy ] of iterateGridInRange(cxx, cyy, 1)) {
			if (!grid[nyy]![nxx]!.wall && !visited[nyy]![nxx]) {
				visited[nyy]![nxx] = true;
				stack.push([ nxx, nyy ]);
			}
		}
	}

	for (const [ yy, row ] of grid.entries()) {
		const visitedRow = visited[yy]!;
		for (const [ xx, cell ] of row.entries()) {
			if (!cell.wall && !visitedRow[xx]) {
				return false;
			}
		}
	}
	return true;
}

interface ExitInterval {
	start: number;
	length: number;
}

function *genExit(): Iterable<number> {
	const exitLength = Math.floor(Math.random() * 43) + 1;
	const intervalsCnt = [ 0, 0, 1, 1, 2 ][Math.floor(Math.random() * 5)]!;
	const exitStart = Math.floor(Math.random() * (46 - exitLength)) + 2;

	const intervals = [ ...function*(): Iterable<ExitInterval> {
		let curStart = exitStart;
		for (let jj = 0; jj < intervalsCnt; jj++) {
			curStart += Math.floor(Math.random() * (exitLength / (intervalsCnt * 2))) + 5;
			let length = Math.floor(Math.random() * (exitLength / (intervalsCnt * 2))) + 5;
			if (length + curStart >= exitStart + exitLength - 5) {
				length = exitStart + exitLength - curStart - 5;
			}
			yield { start: curStart, length };
			curStart += length + 1;
		}
	}() ];

	for (let pos = exitStart; pos <= exitStart + exitLength; pos++) {
		if (intervalsCnt > 0) {
			const first = intervals[0]!;
			if (first.length > 0 && pos >= first.start && pos <= first.start + first.length) {
				continue;
			}
			if (intervalsCnt > 1) {
				const second = intervals[1]!;
				if (second.length > 0 && pos >= second.start && pos <= second.start + second.length) {
					continue;
				}
			}
		}
		if (pos < 2 || pos > 47) continue;
		yield pos;
	}
}

// The borders a highway's lane runs out through -- the ends of the corridor. A vertical lane runs top
// to bottom, a horizontal one left to right, and a crossing carries both, so all four of its sides are
// lane ends. The complement is the sector-facing pair that carries the wall mass and may seal.
function isHighwayLaneSide(orientation: HighwayOrientation, dir: keyof ExitMap): boolean {
	return orientation === 'vertical' ? dir === 'top' || dir === 'bottom' :
		orientation === 'horizontal' ? dir === 'left' || dir === 'right' :
		true;
}

// The live world never narrows the end of a highway lane. Across its 6,832 lane-axis borders every
// one is a single unbroken opening of 21 to 43 tiles, uniformly distributed and centred to within a
// few tiles -- none sealed, none under 10 wide. `genExit` describes an ordinary room's border, up to
// three intervals anywhere from 1 to 43 tiles, and rolls a lane shut often enough to matter.
const kLaneExitMin = 21;
const kLaneExitMax = 43;

// A lane end opens where the two masses flanking it stop. In the live world those are one piece of
// terrain and so they agree: an opening clears its corner by 9.1 tiles on average against a mass
// that reaches 7.3. Rolling the run's position independently of the masses, as a uniform start did,
// seated it alongside one about half the time -- and `markExits` holds the tile inboard of a border
// open across the whole opening, so the overlap reads as a one- or two-tile slot hugging the border
// for as far as the mass reaches.
//
// `dir` indexes its opening along its own border, so the low end is flanked by the left or top mass
// and the high end by the right or bottom one, each sampled a step inboard of the lane border.
function laneEndMargins(rx: number, ry: number, orientation: HighwayOrientation, dir: keyof ExitMap) {
	const mass = orientation === 'crossing' ? kHighwayCornerMass : kHighwayLaneMass;
	const along = dir === 'left' || dir === 'right';
	const inboard = dir === 'top' || dir === 'left' ? 2 : 47;
	const depthAt = (far: boolean): number => {
		const bx = along ? inboard : far ? 49 : 0;
		const by = along ? far ? 49 : 0 : inboard;
		return edgeDepth(rx * 50 + bx, ry * 50 + by, mass) * cornerTaper(inboard);
	};
	return [ depthAt(false), depthAt(true) ] as const;
}

function *genLaneExit(rx: number, ry: number, orientation: HighwayOrientation, dir: keyof ExitMap): Iterable<number> {
	const [ low, high ] = laneEndMargins(rx, ry, orientation, dir);
	const from = Math.round(low) + 1;
	const to = 48 - Math.round(high);
	// The live world never runs a lane end outside this span, so a gap the masses leave too wide or
	// too narrow is clamped and re-centred on itself rather than pinned against one of them.
	const length = Math.min(kLaneExitMax, Math.max(kLaneExitMin, to - from + 1));
	const start = Math.min(48 - length, Math.max(2, Math.round((from + to - length) / 2)));
	for (let pos = start; pos < start + length; ++pos) {
		yield pos;
	}
}

function *exitsArray(terrain: Terrain, axis: 'x' | 'y', fixed: number) {
	for (let ii = 0; ii < 50; ++ii) {
		const xx = axis === 'x' ? fixed : ii;
		const yy = axis === 'x' ? ii : fixed;
		if (terrain.get(xx, yy) !== C.TERRAIN_MASK_WALL) {
			yield ii;
		}
	}
}

// Marks the room's exit tiles (and their inner neighbors) as open so terrain generation keeps the
// border crossings clear.
function markExits(grid: Grid, exits: ExitMap): void {
	for (const xx of exits.top) {
		grid[0]![xx]!.forceOpen = true;
		grid[1]![xx]!.forceOpen = true;
	}
	for (const xx of exits.bottom) {
		grid[49]![xx]!.forceOpen = true;
		grid[48]![xx]!.forceOpen = true;
	}
	for (const yy of exits.left) {
		grid[yy]![0]!.forceOpen = true;
		grid[yy]![1]!.forceOpen = true;
	}
	for (const yy of exits.right) {
		grid[yy]![49]!.forceOpen = true;
		grid[yy]![48]!.forceOpen = true;
	}
}

// Fills the room with cellular-automaton wall (and swamp) noise, rerolling the wall type until the
// open terrain is fully connected, then smooths swamp the same way.
function buildBaseTerrain(exits: ExitMap, wallType: number, swampType: number): Grid {
	let grid: Grid;
	let activeWallType = wallType;
	let tries = 0;
	do {
		grid = makeGrid();
		markExits(grid, exits);
		tries++;
		if (tries > 100) {
			activeWallType = randomWallType();
			tries = 0;
		}

		for (const [ yy, row ] of grid.entries()) {
			for (const [ xx, cell ] of row.entries()) {
				if (cell.forceOpen && isBorder(xx, yy)) {
					continue;
				}
				cell.wall = Math.random() < wallTypes[activeWallType]!.fill;
				cell.swamp = swampType ? Math.random() < swampTypes[swampType]!.fill : false;
			}
		}

		const wallParams = wallTypes[activeWallType]!;
		for (let ii = 0; ii < wallParams.smooth; ++ii) {
			grid = smoothTerrain(grid, wallParams.factor, 'wall');
		}
	} while (!checkFlood(grid));

	if (swampType) {
		const swampParams = swampTypes[swampType]!;
		for (let ii = 0; ii < swampParams.smooth; ++ii) {
			grid = smoothTerrain(grid, swampParams.factor, 'swamp');
		}
	}
	return grid;
}

// Deterministic hash of an integer lattice point to a value in [0, 1).
function latticeValue(ix: number, iy: number): number {
	return (hashCombine(hashMix(ix), iy) >>> 0) / 0x100000000;
}

// Smoothstep-interpolated value noise sampled at world coordinates over a lattice of `cell` tiles.
// Sampling in world (not per-room) space is what makes wall masses continuous across room borders.
function valueNoise(wx: number, wy: number, cell: number): number {
	const gx = wx / cell;
	const gy = wy / cell;
	const ix = Math.floor(gx);
	const iy = Math.floor(gy);
	const tx = gx - ix;
	const ty = gy - iy;
	const sx = tx * tx * (3 - 2 * tx);
	const sy = ty * ty * (3 - 2 * ty);
	const top = latticeValue(ix, iy) + (latticeValue(ix + 1, iy) - latticeValue(ix, iy)) * sx;
	const bottom = latticeValue(ix, iy + 1) + (latticeValue(ix + 1, iy + 1) - latticeValue(ix, iy + 1)) * sx;
	return top + (bottom - top) * sy;
}

// Two octaves of world-coordinate value noise drive a border's mass depth: a coarse field sets the
// depth, a fine field breaks the masses into the detached pieces the live corpus carries (dropping
// it slabs them together).
const kHighwayMassCell = 22;
const kHighwayMassWeight = 0.7;
const kHighwayDetailCell = 6;
function edgeNoise(wx: number, wy: number): number {
	return valueNoise(wx, wy, kHighwayMassCell) * kHighwayMassWeight +
		valueNoise(wx + 1000, wy + 1000, kHighwayDetailCell) * (1 - kHighwayMassWeight);
}

// Orthogonal neighbor offsets. The reconnect search runs 4-connected so a carved slot is a
// contiguous walkable channel, not a diagonal chain.
const kOrthogonal = [ [ 0, -1 ], [ 0, 1 ], [ -1, 0 ], [ 1, 0 ] ] as const;

// Open tiles reachable from (xx, yy), as a set of packed `yy * 50 + xx` keys.
function reachableOpen(grid: Grid, xx: number, yy: number): Set<number> {
	const reached = new Set([ yy * 50 + xx ]);
	const stack = [ [ xx, yy ] as const ];
	while (stack.length > 0) {
		const [ cxx, cyy ] = stack.pop()!;
		for (const [ dxx, dyy ] of kOrthogonal) {
			const nxx = cxx + dxx;
			const nyy = cyy + dyy;
			const key = nyy * 50 + nxx;
			if (nxx >= 0 && nyy >= 0 && nxx <= 49 && nyy <= 49 && !grid[nyy]![nxx]!.wall && !reached.has(key)) {
				reached.add(key);
				stack.push([ nxx, nyy ]);
			}
		}
	}
	return reached;
}

// The distinct open areas the given throats sit in. Throats sharing one are the common case -- a
// lane end is a run of them -- so an area is flooded once and the throats it covers are skipped.
function *throatAreas(grid: Grid, throats: readonly (readonly [ number, number ])[]): Iterable<Set<number>> {
	const covered = new Set<number>();
	for (const [ xx, yy ] of throats) {
		if (!covered.has(yy * 50 + xx)) {
			const area = reachableOpen(grid, xx, yy);
			for (const key of area) {
				covered.add(key);
			}
			yield area;
		}
	}
}

// Breaches the thinnest seal between a cut-off exit throat and the open network: a wall-piercing
// BFS to the nearest open tile, clearing only its shortest path so the throat opens with a slot,
// not a bored channel. Carved tiles join `reached` for the next throat.
function carveToOpen(grid: Grid, sx: number, sy: number, reached: Set<number>): void {
	const start = sy * 50 + sx;
	const prev = new Map([ [ start, -1 ] ]);
	// The queue grows as the search fans out; the array iterator keeps yielding the pushed tiles.
	const queue: (readonly [ number, number ])[] = [ [ sx, sy ] ];
	for (const [ cxx, cyy ] of queue) {
		const key = cyy * 50 + cxx;
		if (key !== start && reached.has(key)) {
			for (let step = key; step !== -1; step = prev.get(step) ?? -1) {
				const pxx = step % 50;
				const pyy = (step - pxx) / 50;
				if (!isBorder(pxx, pyy)) {
					grid[pyy]![pxx]!.wall = false;
				}
				reached.add(step);
			}
			return;
		}
		for (const [ dxx, dyy ] of kOrthogonal) {
			const nxx = cxx + dxx;
			const nyy = cyy + dyy;
			if (nxx >= 0 && nyy >= 0 && nxx <= 49 && nyy <= 49) {
				const nkey = nyy * 50 + nxx;
				if (!prev.has(nkey)) {
					prev.set(nkey, key);
					queue.push([ nxx, nyy ]);
				}
			}
		}
	}
}

// Walls off open ground the room's exits cannot reach. `buildBaseTerrain` holds that invariant for a
// normal room by rerolling until `checkFlood` accepts the layout, but highway terrain is deterministic
// per room coordinate and has no reroll to fall back on, and `connectExits` only breaches the seal
// around an exit throat -- a pocket touching no throat is left stranded. Filling costs a third of a
// tile per room and, unlike breaching, adds no one-wide channel. Reachability is 8-connected because
// creeps move diagonally, the same neighbourhood `checkFlood` accepts.
function fillUnreachable(grid: Grid): void {
	const reached = new Set<number>();
	const stack: (readonly [ number, number ])[] = [];
	for (let ii = 0; ii < 50; ii++) {
		for (const [ xx, yy ] of [ [ ii, 0 ], [ ii, 49 ], [ 0, ii ], [ 49, ii ] ] as const) {
			const key = yy * 50 + xx;
			if (!grid[yy]![xx]!.wall && !reached.has(key)) {
				reached.add(key);
				stack.push([ xx, yy ]);
			}
		}
	}
	while (stack.length > 0) {
		const [ cxx, cyy ] = stack.pop()!;
		for (const [ nxx, nyy ] of iterateGridInRange(cxx, cyy, 1)) {
			const key = nyy * 50 + nxx;
			if (!grid[nyy]![nxx]!.wall && !reached.has(key)) {
				reached.add(key);
				stack.push([ nxx, nyy ]);
			}
		}
	}
	for (const [ yy, row ] of grid.entries()) {
		for (const [ xx, cell ] of row.entries()) {
			if (!cell.wall && !reached.has(yy * 50 + xx)) {
				cell.wall = true;
			}
		}
	}
}

// Connects every exit throat to the open lane, breaching only the thin seal where a wall mass or
// lane blob has cut a throat off -- leaving the open lane (and the blobs studding it) otherwise
// undisturbed.
function connectExits(grid: Grid, exits: ExitMap): void {
	const throats = [
		...exits.top.map(xx => [ xx, 1 ] as const),
		...exits.bottom.map(xx => [ xx, 48 ] as const),
		...exits.left.map(yy => [ 1, yy ] as const),
		...exits.right.map(yy => [ 48, yy ] as const),
	];
	// Anchor on the largest open area a throat sits in -- the lane. Anchoring on whichever throat
	// happens to come first lets one stranded in a shallow border pocket become the target, and
	// every other throat then breaches along the border to reach that pocket instead of straight
	// through to the lane.
	const reached = Fn.maximum(throatAreas(grid, throats), mappedNumericComparator(area => area.size));
	if (reached === undefined) {
		return;
	}
	for (const [ bx, by ] of throats) {
		if (!reached.has(by * 50 + bx)) {
			carveToOpen(grid, bx, by, reached);
		}
	}
}

// Fills and smooths swamp the way buildBaseTerrain does, so highway lanes carry the same organic
// swamp patches normal rooms do (about half of the live highway rooms have some). swampType 0
// means none. smoothTerrain copies every cell, so walls and exits are preserved.
function applySwamp(grid: Grid, swampType: number): Grid {
	if (!swampType) {
		return grid;
	}
	const params = swampTypes[swampType]!;
	for (const row of grid.values()) {
		for (const cell of row.values()) {
			if (!cell.forceOpen) {
				cell.swamp = Math.random() < params.fill;
			}
		}
	}
	let smoothed = grid;
	for (let ii = 0; ii < params.smooth; ++ii) {
		smoothed = smoothTerrain(smoothed, params.factor, 'swamp');
	}
	return smoothed;
}

// About half of the live highway rooms carry swamp; the rest are clear. A highway lane is wide
// open, so a normal-room swamp type would carpet it -- only a mild type (low fill, smoothed back
// to a patch) lands a vanilla-sized patch. Roll no swamp half the time, else the mild type.
const kHighwaySwampType = 1;
function rollHighwaySwamp(): number {
	return Math.random() < 0.5 ? 0 : kHighwaySwampType;
}

// Per-border wall-mass shape; lane masses (vertical/horizontal) run deep, crossing-corner masses
// shallow. Each {base, amp, expo} drives edgeDepth's heavy-tailed wedge, fit to the live corpus.
interface HighwayMass {
	base: number;
	amp: number;
	expo: number;
}
// Both amplitudes carry the mass the smoothing passes below erode, so the finished room lands on the
// live density rather than a few percent under it. The corner amplitude carries a second job since
// `genLaneExit` seats a lane end in the gap its flanking masses leave: on a crossing, where every
// side is a lane end, it is what stops all four openings from running the full width of the border.
const kHighwayLaneMass: HighwayMass = { base: 0.5, amp: 27.5, expo: 2.9 };
const kHighwayCornerMass: HighwayMass = { base: 0.2, amp: 19, expo: 2.5 };
// The free-standing lumps that stud an open lane are stamped ellipses. That is not the process the
// rest of the map uses, and the corpus is unusually blunt about it: a lump's share of its bounding
// box holds at 0.75 to 0.79 from ten tiles to seventy, where a lump grown the way `buildBaseTerrain`
// grows a normal room's decays 0.75 to 0.52 across the same range as it sprawls. A figure flat in
// size is a figure with a fixed shape, and 0.776 is pi/4 -- a filled ellipse in its own box.
// Thresholded noise gives the level sets of the field instead, which run to ridges.
const kHighwayBlobCell = 8;
const kHighwayBlobChance = 0.4;
// Radius in tiles, biased toward the small end: half the live lumps are under fifteen tiles.
const kHighwayBlobMinRadius = 1.3;
const kHighwayBlobMaxRadius = 3.6;
const kHighwayBlobRadiusExpo = 2;
// Long-to-short axis ratio, area held constant across it. The corpus runs 1.35 for every room type.
const kHighwayBlobAspect = 1.35;

// Masses and lane clutter are laid down independently, so a lump lands a tile clear of a mass as
// readily as flush against it, leaving a one-tile seam neither knows it made. A normal room never
// shows those: `buildBaseTerrain` runs the same majority-rule automaton over its fill 2 to 20 times.
// A highway ran it zero. Each pass closes a one-wide channel -- its 3x3 holds six walls -- and rounds
// the wedge boundary, while leaving any mass or lump with body to it intact. Two passes halve the
// seams a single pass leaves; a third rounds the lumps past the live corpus, which carries a few
// genuinely ragged ones.
const kHighwaySmoothPasses = 2;
const kHighwaySmoothFactor = 5;

// Tiles of depth a clipped mass wins back per tile away from the lane opening bounding it.
const kHighwayLaneClipSlope = 3;

// Tiles the wall mass intrudes from the border at world position (wx, wy): a heavy-tailed wedge
// (low base, high exponent), mostly shallow with a rare deep plunge. edgeNoise in [0, 1) bounds it
// to base + amp.
function edgeDepth(wx: number, wy: number, mass: HighwayMass): number {
	return mass.base + mass.amp * edgeNoise(wx, wy) ** mass.expo;
}

interface ClutterBlob {
	cx: number;
	cy: number;
	rx: number;
	ry: number;
}

// The blob a lattice cell carries, or undefined where it carries none. Everything about it comes off
// the cell's own world coordinates, so a blob straddling a room border is the same blob on both
// sides and re-generating a room reproduces it exactly.
function clutterBlob(ix: number, iy: number): ClutterBlob | undefined {
	if (latticeValue(ix, iy) >= kHighwayBlobChance) {
		return undefined;
	}
	// Area is held across the aspect stretch, so the radius roll alone sets how big a lump reads.
	const radius = kHighwayBlobMinRadius + (kHighwayBlobMaxRadius - kHighwayBlobMinRadius) *
		latticeValue(ix + 0x1000, iy + 0x1000) ** kHighwayBlobRadiusExpo;
	const stretch = Math.sqrt(kHighwayBlobAspect);
	const upright = latticeValue(ix + 0x3000, iy + 0x3000) < 0.5;
	return {
		cx: (ix + latticeValue(ix + 0x2000, iy)) * kHighwayBlobCell,
		cy: (iy + latticeValue(ix, iy + 0x2000)) * kHighwayBlobCell,
		rx: upright ? radius / stretch : radius * stretch,
		ry: upright ? radius * stretch : radius / stretch,
	};
}

// Lane clutter for the room at world tile origin (wox, woy), as a `wall` predicate over its tiles.
// Every lattice cell within reach of the room contributes at most one ellipse; a tile is clutter
// when it falls inside any of them. Overlapping stamps merge into the larger, rarer lumps the
// corpus carries in its tail.
function genHighwayClutter(wox: number, woy: number): (xx: number, yy: number) => boolean {
	// A blob centred this far outside the room can still reach into it.
	const reach = Math.ceil(kHighwayBlobMaxRadius * Math.sqrt(kHighwayBlobAspect) / kHighwayBlobCell) + 1;
	const blobs = Fn.pipe(
		Fn.range(Math.floor(wox / kHighwayBlobCell) - reach, Math.floor((wox + 49) / kHighwayBlobCell) + reach + 1),
		$$ => Fn.transform($$, ix => Fn.map(
			Fn.range(Math.floor(woy / kHighwayBlobCell) - reach, Math.floor((woy + 49) / kHighwayBlobCell) + reach + 1),
			iy => clutterBlob(ix, iy))),
		$$ => Fn.reject($$, blob => blob === undefined),
		$$ => [ ...$$ ]);
	return (xx, yy) => Fn.some(blobs, blob =>
		((wox + xx - blob.cx) / blob.rx) ** 2 + ((woy + yy - blob.cy) / blob.ry) ** 2 <= 1);
}

// A multiplier on a border tile's mass depth that anchors the mass at the room's corners and thins it
// toward mid-border, where the diagonal sector blocks stop reaching. The live corpus runs 7.8 tiles
// deep a tile from a corner down to 1.5 at the midpoint; the noise field alone is flat along the
// border, which is what makes a generated mass read as a uniform band rather than a wedge.
// Exponential to a floor, fit to that profile, over its own mean so total mass is unchanged.
const kHighwayCornerFloor = 0.4;
const kHighwayCornerDecay = 7;
// Distinct corner distances along a 50-tile border: `min(along, 49 - along)` runs 0 to 24, and every
// value occurs exactly twice, so averaging the falloff over them averages it over the whole border.
const kHighwayCornerDistances = 25;
function cornerFalloff(corner: number): number {
	return kHighwayCornerFloor + (1 - kHighwayCornerFloor) * Math.exp(-corner / kHighwayCornerDecay);
}
const kHighwayCornerNorm = Fn.pipe(
	Fn.range(kHighwayCornerDistances),
	$$ => Fn.map($$, cornerFalloff),
	$$ => Fn.reduce($$, 0, (total, value) => total + value) / kHighwayCornerDistances);
function cornerTaper(along: number): number {
	return cornerFalloff(Math.min(along, 49 - along)) / kHighwayCornerNorm;
}

// A [0, 1] multiplier on a border tile's mass depth that recedes the mass near an exit -- 0 over
// the exit rising to 1 at the radius -- so a throat opens as a natural mouth, not the bored tunnel
// a reconnect cuts. Concave (sqrt) easing keeps the mass tight to the exit; 2D distance so a mass
// also parts for a perpendicular lane-side exit.
const kHighwayExitClearRadius = 3;
function exitClearance(bx: number, by: number, exitPoints: readonly (readonly [ number, number ])[]): number {
	const nearest = Math.min(...exitPoints.map(([ ex, ey ]) => Math.max(Math.abs(bx - ex), Math.abs(by - ey))));
	if (nearest >= kHighwayExitClearRadius) {
		return 1;
	}
	return Math.sqrt(nearest / kHighwayExitClearRadius);
}

// Highway-room terrain: an open travel lane flanked by the surrounding sector blocks intruding
// from the sector-facing borders -- left+right for a vertical lane, top+bottom for a horizontal
// one, all four corners for a crossing. Wall masses (noise-driven wedge depth) + lane blobs + exit
// recede + a slot-carve reconnect, then swamp. Every piece is tuned to the live highway corpus.
function genHighwayTerrain(
	exits: ExitMap,
	rx: number,
	ry: number,
	orientation: HighwayOrientation,
	swampType: number,
): Grid {
	const grid = makeGrid();
	markExits(grid, exits);
	// Room origin in world tiles. Each border samples the noise field at its own tiles' world
	// positions, so the four masses decorrelate and every mass flows continuously across the shared
	// sector edge.
	const wox = rx * 50;
	const woy = ry * 50;
	const mass = orientation === 'crossing' ? kHighwayCornerMass : kHighwayLaneMass;
	// Every border a mass sits on recedes for the exits it crosses. A crossing is no exception: its
	// masses are shallow, but two tiles of wall over a throat strand the pair markExits force-opens
	// behind it, and the reconnect then bores its way out to the lane.
	const exitPoints = [
		...exits.top.map(xx => [ xx, 0 ] as const),
		...exits.bottom.map(xx => [ xx, 49 ] as const),
		...exits.left.map(yy => [ 0, yy ] as const),
		...exits.right.map(yy => [ 49, yy ] as const),
	];
	// Depth (in tiles) the mass intrudes along one border, indexed by the tile `at(ii)`: the noise
	// wedge sampled at that tile's world position, anchored at the corners and receding toward any
	// nearby exit. A border the lane runs along carries no mass and stays zeroed, so its term never
	// walls a lane tile.
	const depthAlongBorder = (active: boolean, at: (ii: number) => readonly [ number, number ]) => {
		if (!active) {
			return new Array<number>(50).fill(0);
		}
		return Fn.pipe(
			Fn.range(50),
			$$ => Fn.map($$, ii => {
				const [ bx, by ] = at(ii);
				return edgeDepth(wox + bx, woy + by, mass) * cornerTaper(ii) *
					exitClearance(bx, by, exitPoints);
			}),
			$$ => [ ...$$ ]);
	};
	// How far a mass may reach at one end of its border before it would wall the tile inboard of the
	// lane opening running across that end. `markExits` holds that tile open for the whole opening,
	// so a mass reaching under one leaves a one- or two-tile slot to walk instead of a room. Which
	// end of the opening bounds it is the side of the room the mass grows from.
	const laneBound = (lane: readonly number[], lowSide: boolean) =>
		lane.length === 0 ? Infinity : lowSide ? Math.min(...lane) - 1 : 48 - Math.max(...lane);
	// `genLaneExit` seats an opening it rolls itself clear of these masses, but a room inherits its
	// openings from whichever neighbour was generated first, and that one was seated against the
	// neighbour's masses. Clip to the opening this room actually got, releasing over a few tiles so
	// the silhouette away from the corner stays the mass's own.
	const clipToLanes = (depth: number[], low: number, high: number) => Fn.pipe(
		Fn.range(50),
		$$ => Fn.map($$, ii => Math.min(
			depth[ii]!,
			low + Math.max(0, ii - 2) * kHighwayLaneClipSlope,
			high + Math.max(0, 47 - ii) * kHighwayLaneClipSlope)),
		$$ => [ ...$$ ]);
	const leftDepth = clipToLanes(
		depthAlongBorder(orientation !== 'horizontal', ii => [ 0, ii ]),
		laneBound(exits.top, true), laneBound(exits.bottom, true));
	const rightDepth = clipToLanes(
		depthAlongBorder(orientation !== 'horizontal', ii => [ 49, ii ]),
		laneBound(exits.top, false), laneBound(exits.bottom, false));
	const topDepth = clipToLanes(
		depthAlongBorder(orientation !== 'vertical', ii => [ ii, 0 ]),
		laneBound(exits.left, true), laneBound(exits.right, true));
	const bottomDepth = clipToLanes(
		depthAlongBorder(orientation !== 'vertical', ii => [ ii, 49 ]),
		laneBound(exits.left, false), laneBound(exits.right, false));
	const clutter = genHighwayClutter(wox, woy);
	for (const [ yy, row ] of grid.entries()) {
		for (const [ xx, cell ] of row.entries()) {
			if (cell.forceOpen) {
				continue;
			}
			// Frame every non-exit border tile as wall, the way smoothTerrain does for normal rooms.
			cell.wall = isBorder(xx, yy) ||
				xx <= leftDepth[yy]! || 49 - xx <= rightDepth[yy]! ||
				yy <= topDepth[xx]! || 49 - yy <= bottomDepth[xx]! ||
				clutter(xx, yy);
		}
	}
	const smoothed = Fn.pipe(
		Fn.range(kHighwaySmoothPasses),
		$$ => Fn.reduce($$, grid, working => smoothTerrain(working, kHighwaySmoothFactor, 'wall')));
	connectExits(smoothed, exits);
	fillUnreachable(smoothed);
	return applySwamp(smoothed, swampType);
}

const kNoTags: ReadonlySet<string> = new Set();

// Spread placements keep at least this Chebyshev distance from every anchor; the jitter widens the
// eligible band below the farthest candidate so results vary naturally instead of always taking
// the extreme corner.
const kMinSpreadSpacing = 14;
const kSpreadJitter = 0.7;

function makeGeneratorContext(room: Room, terrain: Terrain, options: GenerateRoomOptions): RoomGeneratorContext {
	const tags = new Map<number, Set<string>>();
	const tagsAt = (position: RoomPosition): ReadonlySet<string> => tags.get(position['#id']) ?? kNoTags;
	const isWall = (position: RoomPosition) => terrain.get(position.x, position.y) === C.TERRAIN_MASK_WALL;
	return {
		options,
		room,
		terrain,
		findRandomPosition: (min, span, accept) => Fn.pipe(
			shuffledSquare(min, span),
			$$ => Fn.map($$, ([ xx, yy ]) => new RoomPosition(xx, yy, room.name)),
			$$ => Fn.find($$, accept)),
		findSpreadPosition(min, span, accept, anchors) {
			const candidates = [ ...Fn.pipe(
				iterateArea(room.name, min, min, min + span - 1, min + span - 1),
				$$ => Fn.filter($$, accept),
				$$ => Fn.map($$, position => ({
					position,
					nearest: Math.min(...anchors.map(anchor => position.getRangeTo(anchor))),
				}))) ];
			const best = Math.max(...candidates.map(candidate => candidate.nearest), 0);
			if (best < kMinSpreadSpacing) {
				return undefined;
			}
			const threshold = Math.max(kMinSpreadSpacing, best * kSpreadJitter);
			const eligible = candidates.filter(candidate => candidate.nearest >= threshold);
			return eligible[Math.floor(Math.random() * eligible.length)]!.position;
		},
		isPlaceable: position => isWall(position) && tagsAt(position).size === 0 &&
			Fn.some(iterateNeighbors(position), neighbor => !isWall(neighbor)),
		place(object, ...objectTags) {
			room['#insertObject'](object);
			const key = object.pos['#id'];
			const tileTags = tags.get(key) ?? new Set();
			for (const tag of objectTags) {
				tileTags.add(tag);
			}
			tags.set(key, tileTags);
		},
		tagsAt,
	};
}

const kMaxGenerateAttempts = 50;

// Generates the room's terrain and object placements, retrying with a fresh wall type when the
// layout can't satisfy every generator's placement constraints, and giving up (rather than looping
// forever) after a bounded number of attempts.
function genRoom(roomName: string, exits: ExitMap, options: GenerateRoomOptions) {
	const generators = [ ...hooks.map('roomGenerator') ].sort(mappedNumericComparator(generator => generator.order));
	const swampType = options.swampType ??
		(options.highway ? rollHighwaySwamp() : Math.floor(Math.random() * 14));
	// Highway terrain is a deterministic function of world position, so a retry would rebuild it
	// identically -- one failed attempt settles the outcome.
	const maxAttempts = options.highway ? 1 : kMaxGenerateAttempts;
	for (let attempt = 0; attempt < maxAttempts; ++attempt) {
		const terrain = gridToTerrain(function() {
			if (options.highway) {
				const { rx, ry } = parseRoomName(roomName);
				return genHighwayTerrain(exits, rx, ry, options.highway, swampType);
			}
			const wallType = attempt === 0 ? options.terrainType ?? randomWallType() : randomWallType();
			return buildBaseTerrain(exits, wallType, swampType);
		}());
		const room = new Room();
		room.name = roomName;
		const context = makeGeneratorContext(room, terrain, options);
		if (generators.every(generator => generator.generate(context))) {
			return { room, terrain };
		}
	}
	throw new Error(`Failed to generate room terrain after ${maxAttempts} attempt(s)`);
}

function gridToTerrain(grid: Grid): TerrainWriter {
	const terrain = new TerrainWriter();
	for (const [ yy, row ] of grid.entries()) {
		for (const [ xx, cell ] of row.entries()) {
			if (cell.wall) {
				terrain.set(xx, yy, C.TERRAIN_MASK_WALL);
			} else if (cell.swamp) {
				let hasNonWall = false;
				for (let dyy = -1; dyy <= 1; dyy++) {
					for (let dxx = -1; dxx <= 1; dxx++) {
						const nxx = xx + dxx;
						const nyy = yy + dyy;
						if (nxx >= 0 && nxx <= 49 && nyy >= 0 && nyy <= 49 && !grid[nyy]![nxx]!.wall) {
							hasNonWall = true;
							break;
						}
					}
					if (hasNonWall) break;
				}
				if (hasNonWall) {
					terrain.set(xx, yy, C.TERRAIN_MASK_SWAMP);
				}
			}
		}
	}
	return terrain;
}

// Builds a room's terrain and objects entirely in memory; performs no storage I/O. `lookupTerrain`
// resolves an already-built neighbor's terrain so shared exits line up.
function buildRoom(
	roomName: string,
	options: GenerateRoomOptions | undefined,
	lookupTerrain: (neighborName: string) => { terrain: Terrain } | undefined,
) {
	const { rx, ry } = parseRoomName(roomName);

	const dirs = {
		top: { neighborName: makeRoomName(rx, ry - 1), axis: 'y' as const, fixed: 49 },
		right: { neighborName: makeRoomName(rx + 1, ry), axis: 'x' as const, fixed: 0 },
		bottom: { neighborName: makeRoomName(rx, ry + 1), axis: 'y' as const, fixed: 0 },
		left: { neighborName: makeRoomName(rx - 1, ry), axis: 'x' as const, fixed: 49 },
	};

	const exits: ExitMap = { top: [], right: [], bottom: [], left: [] };

	for (const dir of [ 'top', 'right', 'bottom', 'left' ] as const) {
		const info = dirs[dir];
		const userExits = options?.exits?.[dir];
		const neighborTerrain = lookupTerrain(info.neighborName);

		if (userExits) {
			if (neighborTerrain) {
				const neighborExits = [ ...exitsArray(neighborTerrain.terrain, info.axis, info.fixed) ];
				const match = neighborExits.length === userExits.length &&
					userExits.every(exit => neighborExits.includes(exit));
				if (!match) {
					throw new Error(`Exits in room ${info.neighborName} don't match`);
				}
			}
			exits[dir] = userExits;
		} else if (neighborTerrain) {
			exits[dir] = [ ...exitsArray(neighborTerrain.terrain, info.axis, info.fixed) ];
		} else if (options?.highway !== undefined && isHighwayLaneSide(options.highway, dir)) {
			exits[dir] = [ ...genLaneExit(rx, ry, options.highway, dir) ];
		} else {
			exits[dir] = [ ...genExit() ];
		}
	}

	const { room, terrain } = genRoom(roomName, exits, options ?? {});
	room['#flushObjects'](null);
	flushUsers(room);

	return { room, terrain };
}

// Inserts a freshly built room's record into the terrain map with its authored geometry. Sector
// meta starts empty -- it can only be stamped correctly once every room of the batch is in the
// map, so `refreshRoomMeta` owns the stamping.
function commitRoom(terrainMap: WorldTerrain, roomName: string, terrain: Terrain) {
	terrainMap.set(roomName, { exits: packExits(terrain), terrain, sectors: [], sectorControl: undefined });
}

// Sector relationships are stored bidirectionally, so a room landing can extend the records of
// rooms generated earlier -- an existing member gains this center, a center gains this member.
// Restamps the geometry of every record within sector range of the given rooms.
function refreshRoomMeta(terrainMap: WorldTerrain, roomNames: Iterable<string>) {
	const allNames = new Set(terrainMap.keys());
	const touched = new Set<string>();
	for (const roomName of roomNames) {
		const { rx, ry } = parseSignedRoomName(roomName);
		for (const [ xx, yy ] of iterateRoomsInRange(rx, ry, 5)) {
			touched.add(makeSignedRoomName(xx, yy));
		}
	}
	for (const name of touched) {
		const record = terrainMap.get(name);
		if (record) {
			terrainMap.set(name, { ...record, ...computeRoomMeta(name, allNames) });
		}
	}
}

// A freshly-created shard has no world terrain blob; the strict (redis) provider then throws
// "terrain does not exist" out of loadWorld. Seed an empty terrain map so the first generated room
// can bootstrap the world. (The local provider tolerates the missing key, masking this.)
async function ensureWorldTerrain(shard: Shard) {
	if (await shard.data.get('terrain', { blob: true }) === null) {
		await shard.data.set('terrain', makeWriter(MapSchema.schema)(new Map()));
	}
}

// Serializes the terrain map and registers the freshly built rooms in a single batch write.
async function flushRooms(shard: Shard, terrainMap: WorldTerrain, rooms: Room[]) {
	if (rooms.length === 0) {
		return;
	}
	await Promise.all([
		shard.data.set('terrain', makeWriter(MapSchema.schema)(terrainMap)),
		shard.data.sAdd('rooms', rooms.map(room => room.name)),
		...rooms.map(room => shard.saveRoom(room.name, shard.time, room)),
	]);
}

export async function generateRoom(
	shard: Shard,
	roomName: string,
	options?: GenerateRoomOptions,
): Promise<Room> {
	const { rx, ry } = parseSignedRoomName(roomName);
	if (Number.isNaN(rx) || Number.isNaN(ry)) {
		throw new Error(`Invalid room name: ${roomName}`);
	}

	await ensureWorldTerrain(shard);
	const [ world, existingRooms ] = await Promise.all([ shard.loadWorld(), shard.data.sMembers('rooms') ]);
	if (existingRooms.includes(roomName)) {
		throw new Error(`Room already exists: ${roomName}`);
	}

	const terrainMap = new Map(world.terrain);
	const { room, terrain } = buildRoom(roomName, options, neighborName => terrainMap.get(neighborName));
	commitRoom(terrainMap, roomName, terrain);
	refreshRoomMeta(terrainMap, [ roomName ]);
	await flushRooms(shard, terrainMap, [ room ]);

	return room;
}

interface SectorOrigin {
	rx: number;
	ry: number;
	// Signed-coordinate direction of increasing printed room numbers, per axis.
	xStep: number;
	yStep: number;
}

// A sector's origin is its outer highway ring corner nearest the world axes, so it sits at printed
// multiples of 10 on both axes; the sector spans printed coordinates `n..n+10` away from the axes.
function parseSectorOrigin(name: string): SectorOrigin {
	const { rx, ry } = parseSignedRoomName(name);
	if (Number.isNaN(rx) || Number.isNaN(ry)) {
		throw new Error(`Invalid room name: ${name}`);
	}
	const xNum = rx < 0 ? -1 - rx : rx;
	const yNum = ry < 0 ? -1 - ry : ry;
	if (xNum % 10 !== 0 || yNum % 10 !== 0) {
		throw new Error(`Sector origin must be at a multiple of 10: ${name}`);
	}
	if (xNum + 10 >= kMaxWorldSize >>> 1 || yNum + 10 >= kMaxWorldSize >>> 1) {
		throw new Error(`Sector ${name} extends past world bounds`);
	}
	return { rx, ry, xStep: rx < 0 ? -1 : 1, yStep: ry < 0 ? -1 : 1 };
}

// Per-type object loadouts. Highways are object-free open corridors; source-keeper rooms hold
// three guarded sources and a guarded mineral with no controller; center rooms are the same but
// keeper-free; normal rooms keep the caller/default loadout (controller + 1-2 sources + mineral).
const roomTypeTemplates: Record<RoomType, GenerateRoomOptions> = {
	center: { controller: false, keeperLairs: false, sources: 3 },
	highway: { controller: false, keeperLairs: false, mineral: false, sources: 0 },
	normal: {},
	sourceKeeper: { controller: false, keeperLairs: true, sources: 3 },
};

interface SectorDir {
	dxx: number;
	dyy: number;
	// The neighbor's border shared with this room, as its `packExits` bit.
	sharedExitBit: number;
}

const kSectorDirs: Record<keyof ExitMap, SectorDir> = {
	top: { dxx: 0, dyy: -1, sharedExitBit: 4 },
	right: { dxx: 1, dyy: 0, sharedExitBit: 8 },
	bottom: { dxx: 0, dyy: 1, sharedExitBit: 1 },
	left: { dxx: -1, dyy: 0, sharedExitBit: 2 },
};

// The live world walls off some borders where both sides carry a wall mass: a normal room seals
// about one of its four sides on average, and a highway seals its mass sides at much the same
// rate. A void border between two sealable sides seals with this probability; the neighbor
// inherits the seal when it builds.
const kSealSideProbability = 0.3;

// A highway may seal only its mass sides (the lane must run through); a normal room may seal a
// side facing another normal or highway room, but never the sector core; source-keeper and center
// rooms never seal, since walling off the core would strand the sector's guarded rooms.
function isSealableSide(type: RoomType, dir: keyof ExitMap, roomName: string, neighborName: string, hasController: boolean): boolean {
	if (type === 'highway') {
		return !isHighwayLaneSide(highwayOrientation(roomName), dir);
	} else if (type === 'normal' && hasController) {
		const neighborType = roomType(neighborName);
		return neighborType === 'normal' || neighborType === 'highway';
	}
	return false;
}

// Builds every not-yet-existing room of one sector into the shared accumulators -- terrain into
// `terrainMap`, names into `existing` so later rooms see them as neighbors -- and yields the new
// rooms. The range is the inclusive 11x11 block from the origin, so the sector is bounded by its
// full highway ring on all four sides -- the origin-corner rings plus the rings shared with the
// next sectors. Already-existing rooms are skipped, so the shared rings are idempotent across
// adjacent sectors and partially-built sectors can be re-entered. No storage I/O; the caller
// flushes once.
function *accumulateSector(
	origin: SectorOrigin,
	options: GenerateRoomOptions | undefined,
	terrainMap: WorldTerrain,
	existing: Set<string>,
): Iterable<Room> {
	for (const [ rx, ry ] of iterateRoomsInRange(origin.rx + 5 * origin.xStep, origin.ry + 5 * origin.yStep, 5)) {
		const roomName = makeSignedRoomName(rx, ry);
		if (existing.has(roomName)) {
			continue;
		}
		const type = roomType(roomName);
		const template = roomTypeTemplates[type];
		const hasController = (template.controller ?? options?.controller) !== false;

		// Roll seals on void borders; sides facing a built room inherit its border instead.
		const sealed: (keyof ExitMap)[] = [];
		let openSides = 0;
		for (const dir of [ 'top', 'right', 'bottom', 'left' ] as const) {
			const sectorDir = kSectorDirs[dir];
			const neighborName = makeSignedRoomName(rx + sectorDir.dxx, ry + sectorDir.dyy);
			const record = terrainMap.get(neighborName);
			if (record) {
				if ((record.exits & sectorDir.sharedExitBit) !== 0) {
					openSides += 1;
				}
			} else if (isSealableSide(type, dir, roomName, neighborName, hasController) &&
				Math.random() < kSealSideProbability) {
				sealed.push(dir);
			} else {
				openSides += 1;
			}
		}
		// Never wall off all four sides -- reopen a rolled seal when no border can carry an exit. A
		// re-entered hole whose four built neighbors all sealed toward it has nothing to reopen and
		// still generates a zero-exit room; rare, locally unfixable (the neighbors' terrain is already
		// authored), and the live world does carry fully sealed rooms.
		if (openSides === 0 && sealed.length > 0) {
			sealed.shift();
		}

		const roomOptions: GenerateRoomOptions = {
			...type === 'normal' && options,
			...template,
			...type === 'highway' && { highway: highwayOrientation(roomName) },
			exits: Fn.fromEntries(Fn.map(sealed, dir => [ dir, [] ])),
		};
		const { room, terrain } = buildRoom(roomName, roomOptions, neighborName => terrainMap.get(neighborName));
		commitRoom(terrainMap, roomName, terrain);
		existing.add(roomName);
		yield room;
	}
}

export async function generateSector(
	shard: Shard,
	sectorName: string,
	options?: GenerateRoomOptions,
): Promise<Room[]> {
	const origin = parseSectorOrigin(sectorName);
	await ensureWorldTerrain(shard);
	const [ world, existingRooms ] = await Promise.all([ shard.loadWorld(), shard.data.sMembers('rooms') ]);
	const terrainMap = new Map(world.terrain);
	const rooms = [ ...accumulateSector(origin, options, terrainMap, new Set(existingRooms)) ];
	refreshRoomMeta(terrainMap, Fn.map(rooms, room => room.name));
	await flushRooms(shard, terrainMap, rooms);
	return rooms;
}
