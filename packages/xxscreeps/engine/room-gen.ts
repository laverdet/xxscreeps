import type { Shard } from 'xxscreeps/engine/db/index.js';
import type { HighwayOrientation, RoomType } from 'xxscreeps/game/room/sector.js';
import type { ResourceType } from 'xxscreeps/mods/resource/resource.js';
import { Fn } from 'xxscreeps/functional/fn.js';
import * as C from 'xxscreeps/game/constants/index.js';
import { makeLocalIterateInRangeTo } from 'xxscreeps/game/direction.js';
import * as MapSchema from 'xxscreeps/game/map.js';
import * as RoomObject from 'xxscreeps/game/object.js';
import { RoomPosition } from 'xxscreeps/game/position.js';
import { Room } from 'xxscreeps/game/room/index.js';
import { makeRoomName, parseRoomName } from 'xxscreeps/game/room/name.js';
import { flushUsers } from 'xxscreeps/game/room/room.js';
import { highwayOrientation } from 'xxscreeps/game/room/sector.js';
import { Terrain, TerrainWriter, isBorder, packExits } from 'xxscreeps/game/terrain.js';
import { StructureController } from 'xxscreeps/mods/controller/controller.js';
import { create as createExtractor } from 'xxscreeps/mods/mineral/extractor.js';
import { Mineral } from 'xxscreeps/mods/mineral/mineral.js';
import { create as createKeeperLair } from 'xxscreeps/mods/source/keeper-lair.js';
import { Source } from 'xxscreeps/mods/source/source.js';
import { makeWriter } from 'xxscreeps/schema/write.js';

type ExitSide = 'top' | 'right' | 'bottom' | 'left';
type ExitMap = Record<ExitSide, number[]>;

// The world's per-room terrain map, as returned by `shard.loadWorld()`. The generation entry points
// accumulate freshly built rooms into one of these and serialize it once, rather than once per room.
type WorldTerrain = Awaited<ReturnType<Shard['loadWorld']>>['terrain'];

export interface GenerateRoomOptions {
	exits?: Partial<ExitMap>;
	terrainType?: number;
	swampType?: number;
	sources?: number;
	mineral?: ResourceType | false;
	controller?: boolean;
	keeperLairs?: boolean;
	extractor?: boolean;
	// Generate open highway-corridor terrain (mostly open with sparse wall clusters) instead of the
	// cellular-automaton terrain used for normal rooms.
	corridor?: boolean;
}

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

const kWallTypeCount = Object.keys(wallTypes).length;
const kSwampTypeCount = Object.keys(swampTypes).length;

// Procedural rooms pick a wall type uniformly from the table.
function randomWallType(): number {
	return Math.floor(Math.random() * kWallTypeCount) + 1;
}

export const mineralPool: ResourceType[] = [
	C.RESOURCE_HYDROGEN, C.RESOURCE_HYDROGEN, C.RESOURCE_HYDROGEN,
	C.RESOURCE_HYDROGEN, C.RESOURCE_HYDROGEN, C.RESOURCE_HYDROGEN,
	C.RESOURCE_OXYGEN, C.RESOURCE_OXYGEN, C.RESOURCE_OXYGEN,
	C.RESOURCE_OXYGEN, C.RESOURCE_OXYGEN, C.RESOURCE_OXYGEN,
	C.RESOURCE_ZYNTHIUM, C.RESOURCE_ZYNTHIUM, C.RESOURCE_ZYNTHIUM,
	C.RESOURCE_KEANIUM, C.RESOURCE_KEANIUM, C.RESOURCE_KEANIUM,
	C.RESOURCE_UTRIUM, C.RESOURCE_UTRIUM, C.RESOURCE_UTRIUM,
	C.RESOURCE_LEMERGIUM, C.RESOURCE_LEMERGIUM, C.RESOURCE_LEMERGIUM,
	C.RESOURCE_CATALYST,
];

interface Cell {
	wall: boolean;
	swamp: boolean;
	forceOpen: boolean;
	exit: boolean;
	source: boolean;
	controller: boolean;
	keeperLair: boolean;
	mineral: boolean;
}

type Grid = Cell[][];

// Yields the in-bounds tiles within Chebyshev `range` of (xx, yy) (the tile itself included), clamped
// to the 50x50 grid, so neighbour walks don't need their own bounds guards.
const iterateGridInRange = makeLocalIterateInRangeTo(0, 49);

function makeGrid(): Grid {
	const grid: Grid = [];
	for (let yy = 0; yy < 50; yy++) {
		const row: Cell[] = [];
		for (let xx = 0; xx < 50; xx++) {
			row.push({
				wall: false, swamp: false, forceOpen: false,
				exit: false, source: false, controller: false, keeperLair: false, mineral: false,
			});
		}
		grid.push(row);
	}
	return grid;
}

function smoothTerrain(grid: Grid, factor: number, key: 'wall' | 'swamp'): Grid {
	const next = makeGrid();
	for (let yy = 0; yy < 50; yy++) {
		const row = grid[yy]!;
		const nextRow = next[yy]!;
		for (let xx = 0; xx < 50; xx++) {
			const cell = row[xx]!;
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

	outer:
	for (let xx = 0; xx < 50; xx++) {
		for (let yy = 0; yy < 50; yy++) {
			if (!grid[yy]![xx]!.wall) {
				startXx = xx;
				startYy = yy;
				break outer;
			}
		}
	}

	if (startXx === -1) return false;

	const visited: boolean[][] = [];
	for (let yy = 0; yy < 50; yy++) {
		visited.push(new Array<boolean>(50).fill(false));
	}

	const stack: [number, number][] = [ [ startXx, startYy ] ];
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

	for (let yy = 0; yy < 50; yy++) {
		const row = grid[yy]!;
		const visitedRow = visited[yy]!;
		for (let xx = 0; xx < 50; xx++) {
			if (!row[xx]!.wall && !visitedRow[xx]) {
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

function genExit(): number[] {
	const exitLength = Math.floor(Math.random() * 43) + 1;
	const intervalsCnt = [ 0, 0, 1, 1, 2 ][Math.floor(Math.random() * 5)]!;
	const exitStart = Math.floor(Math.random() * (46 - exitLength)) + 2;

	const intervals: ExitInterval[] = [];
	let curStart = exitStart;

	for (let jj = 0; jj < intervalsCnt; jj++) {
		curStart += Math.floor(Math.random() * (exitLength / (intervalsCnt * 2))) + 5;
		let length = Math.floor(Math.random() * (exitLength / (intervalsCnt * 2))) + 5;
		if (length + curStart >= exitStart + exitLength - 5) {
			length = exitStart + exitLength - curStart - 5;
		}
		intervals.push({ start: curStart, length });
		curStart += length + 1;
	}

	const exit: number[] = [];
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
		exit.push(pos);
	}
	return exit;
}

function exitsArray(terrain: Terrain, axis: 'x' | 'y', fixed: number): number[] {
	const exits: number[] = [];
	for (let ii = 0; ii < 50; ii++) {
		const xx = axis === 'x' ? fixed : ii;
		const yy = axis === 'x' ? ii : fixed;
		if (terrain.get(xx, yy) !== C.TERRAIN_MASK_WALL) {
			exits.push(ii);
		}
	}
	return exits;
}

function hasPassableNeighbor(grid: Grid, xx: number, yy: number): boolean {
	return Fn.some(iterateGridInRange(xx, yy, 1), ([ nxx, nyy ]) => !grid[nyy]![nxx]!.wall);
}

// BFS outward from (xx, yy) through passable terrain for a wall tile 3-5 steps away to host a keeper
// lair, returning a uniformly random candidate or undefined when none exists.
function findLairSpot(grid: Grid, xx: number, yy: number): [ number, number ] | undefined {
	const lairSpots: [ number, number ][] = [];
	const visited = new Map<number, number>();
	const queue: [ number, number ][] = [ [ xx, yy ] ];
	visited.set(yy * 50 + xx, 0);

	while (queue.length > 0) {
		const [ cxx, cyy ] = queue.shift()!;
		const dist = visited.get(cyy * 50 + cxx)!;
		for (const [ nxx, nyy ] of iterateGridInRange(cxx, cyy, 1)) {
			const key = nyy * 50 + nxx;
			if (visited.has(key)) continue;

			const distance = dist + 1;
			visited.set(key, distance);

			const neighbor = grid[nyy]![nxx]!;
			if (distance >= 3 && distance <= 5 &&
				neighbor.wall && !neighbor.source &&
				nxx > 0 && nxx < 49 && nyy > 0 && nyy < 49) {
				lairSpots.push([ nxx, nyy ]);
			}
			if (!neighbor.wall && distance < 5) {
				queue.push([ nxx, nyy ]);
			}
		}
	}

	if (lairSpots.length === 0) {
		return undefined;
	}
	return lairSpots[Math.floor(Math.random() * lairSpots.length)];
}

// Marks the room's exit tiles (and their inner neighbors) as open so terrain generation keeps the
// border crossings clear.
function markExits(grid: Grid, exits: ExitMap): void {
	for (const xx of exits.top) { grid[0]![xx]!.exit = true; grid[0]![xx]!.forceOpen = true; grid[1]![xx]!.forceOpen = true; }
	for (const xx of exits.bottom) { grid[49]![xx]!.exit = true; grid[49]![xx]!.forceOpen = true; grid[48]![xx]!.forceOpen = true; }
	for (const yy of exits.left) { grid[yy]![0]!.exit = true; grid[yy]![0]!.forceOpen = true; grid[yy]![1]!.forceOpen = true; }
	for (const yy of exits.right) { grid[yy]![49]!.exit = true; grid[yy]![49]!.forceOpen = true; grid[yy]![48]!.forceOpen = true; }
}

// Deterministic hash of an integer lattice point to a value in [0, 1).
function latticeValue(ix: number, iy: number): number {
	let hash = Math.imul(ix, 374761393) + Math.imul(iy, 668265263);
	hash = Math.imul(hash ^ (hash >>> 13), 1274126177);
	return ((hash ^ (hash >>> 16)) >>> 0) / 0x100000000;
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

// Two octaves of world-coordinate value noise drive a highway border's mass depth: a room-scale field
// sets the depth (and varies it room to room within vanilla's tight band), a fine field offset off the
// first makes the inner boundary organic. Sampling the same 2D field at each border tile keeps the mass
// continuous across every shared sector edge — stacked highway rooms read one unbroken noise function
// down the corridor — and rotationally symmetric, so vertical and horizontal lanes look alike.
const kHighwayMassCell = 22;
const kHighwayMassWeight = 0.7;
const kHighwayDetailCell = 6;
function edgeNoise(wx: number, wy: number): number {
	return valueNoise(wx, wy, kHighwayMassCell) * kHighwayMassWeight +
		valueNoise(wx + 1000, wy + 1000, kHighwayDetailCell) * (1 - kHighwayMassWeight);
}

// Open tiles reachable from (xx, yy), as a set of packed `yy * 50 + xx` keys.
function reachableOpen(grid: Grid, xx: number, yy: number): Set<number> {
	const reached = new Set([ yy * 50 + xx ]);
	const stack: [ number, number ][] = [ [ xx, yy ] ];
	while (stack.length > 0) {
		const [ cxx, cyy ] = stack.pop()!;
		for (const [ dxx, dyy ] of [ [ 0, -1 ], [ 0, 1 ], [ -1, 0 ], [ 1, 0 ] ] as const) {
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

// Breaches the thinnest seal between a cut-off exit throat and the open network. A breadth-first
// search that may pass through walls finds the nearest already-open tile, then clears only the walls
// on that shortest path — so a throat ringed by a lane blob opens with a one- or two-tile slot rather
// than a corridor driven clear across the room. Carved tiles join `reached` for the next throat.
function carveToOpen(grid: Grid, sx: number, sy: number, reached: Set<number>): void {
	const start = sy * 50 + sx;
	const prev = new Map<number, number>([ [ start, -1 ] ]);
	// The queue grows as the search fans out; the array iterator keeps yielding the pushed tiles.
	const queue: [ number, number ][] = [ [ sx, sy ] ];
	for (const [ cxx, cyy ] of queue) {
		const key = cyy * 50 + cxx;
		if (key !== start && reached.has(key)) {
			for (let step = key; step !== -1; step = prev.get(step) ?? -1) {
				const pxx = step % 50;
				const pyy = (step - pxx) / 50;
				if (pxx >= 1 && pxx <= 48 && pyy >= 1 && pyy <= 48) grid[pyy]![pxx]!.wall = false;
				reached.add(step);
			}
			return;
		}
		for (const [ dxx, dyy ] of [ [ 0, -1 ], [ 0, 1 ], [ -1, 0 ], [ 1, 0 ] ] as const) {
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

// Connects every exit throat to the open lane, breaching only the thin seal where a wall mass or lane
// blob has cut a throat off — leaving the open lane (and the blobs studding it) otherwise undisturbed.
function connectExits(grid: Grid, exits: ExitMap): void {
	const throats: [ number, number ][] = [
		...exits.top.map((xx): [ number, number ] => [ xx, 1 ]),
		...exits.bottom.map((xx): [ number, number ] => [ xx, 48 ]),
		...exits.left.map((yy): [ number, number ] => [ 1, yy ]),
		...exits.right.map((yy): [ number, number ] => [ 48, yy ]),
	];
	if (throats.length <= 1) return;
	const [ ax, ay ] = throats[0]!;
	const reached = reachableOpen(grid, ax, ay);
	for (const [ bx, by ] of throats.slice(1)) {
		if (!reached.has(by * 50 + bx)) {
			carveToOpen(grid, bx, by, reached);
		}
	}
}

// Fills and smooths swamp the way genTerrain does, so highway lanes carry the same organic swamp
// patches normal rooms do (about half of vanilla highway rooms have some). swampType 0 means none.
// Returns the smoothed grid; smoothTerrain copies every cell, so walls and exits are preserved.
function applySwamp(grid: Grid, swampType: number): Grid {
	if (!swampType) {
		return grid;
	}
	const params = swampTypes[swampType]!;
	for (let yy = 1; yy < 49; yy++) {
		const row = grid[yy]!;
		for (let xx = 1; xx < 49; xx++) {
			const cell = row[xx]!;
			if (!cell.forceOpen) {
				cell.swamp = Math.random() < params.fill;
			}
		}
	}
	let smoothed = grid;
	for (let ii = 0; ii < params.smooth; ii++) {
		smoothed = smoothTerrain(smoothed, params.factor, 'swamp');
	}
	return smoothed;
}

// About half of vanilla highway rooms carry swamp; the rest are clear. A highway lane is wide open,
// so a normal-room swamp type would carpet it — only a mild type (low fill, smoothed back to a patch)
// lands a vanilla-sized ~10-90 tile patch. Roll no swamp half the time, else the mild type.
const kHighwaySwampType = 1;
function rollHighwaySwamp(): number {
	return Math.random() < 0.5 ? 0 : kHighwaySwampType;
}

// Highway terrain, tuned to the live highway corpus (see room-generation-plan.md). A highway is the
// travel lane between the surrounding sector blocks; the walls are those blocks intruding from the
// room's sector-facing borders. Each such border carries a wall mass whose depth (in tiles) is driven
// by `edgeNoise` into a heavy-tailed wedge — mostly a shallow few tiles, occasionally plunging deep —
// so the mass tapers along the border as a smooth diagonal rather than a uniform band. Lane masses
// (vertical: left+right; horizontal: top+bottom) run deeper; crossing masses sit shallower on all four
// borders, deepest where two meet at a corner. The open lane is then studded with solid wall blobs —
// a coarse value-noise field thresholded into chunky islands, the clutter real highway lanes carry;
// on the borders these blobs merge into the mass and disappear.
interface HighwayMass { base: number; amp: number; expo: number }
const kHighwayLaneMass: HighwayMass = { base: 0.5, amp: 26, expo: 2.9 };
const kHighwayCornerMass: HighwayMass = { base: 0.2, amp: 8, expo: 2.5 };
const kHighwayMaxDepth = 18;
// A coarse value-noise field thresholded into solid wall blobs that stud the open lane.
const kHighwayBlobCell = 6;
const kHighwayBlobThreshold = 0.82;

// Tiles the wall mass intrudes from the border at world position (wx, wy). The high exponent on a low
// base makes a heavy-tailed wedge — most borders shallow, a few plunging deep — the smooth tapering
// diagonal mass the live corpus carries, rather than a uniform band.
function edgeDepth(wx: number, wy: number, mass: HighwayMass): number {
	return Math.min(mass.base + mass.amp * edgeNoise(wx, wy) ** mass.expo, kHighwayMaxDepth);
}

// Near an exit a lane mass recedes to nothing and rises back to full depth over this radius, so a throat
// the mass would otherwise seal opens as a tight natural mouth — the way the live world's masses part
// where a lane crosses them — rather than the 1-wide tunnel a bored reconnect leaves. The concave easing
// (sqrt) keeps the mass close to the exit, matching the live recede profile (depth ~2 one tile off an
// exit, not a wide-cut hollow). Distance is 2D to every exit, so a mass also parts for a perpendicular
// lane-side exit it would otherwise bury in the corner. Returns a [0, 1] multiplier on a border tile's
// mass depth: 0 over an exit, 1 at the radius.
const kHighwayExitClearRadius = 3;
function exitClearance(bx: number, by: number, exitPoints: readonly (readonly [ number, number ])[]): number {
	let nearest = Infinity;
	for (const [ ex, ey ] of exitPoints) {
		const dist = Math.max(Math.abs(bx - ex), Math.abs(by - ey));
		if (dist < nearest) nearest = dist;
	}
	if (nearest >= kHighwayExitClearRadius) return 1;
	return Math.sqrt(nearest / kHighwayExitClearRadius);
}

// Generates highway-room terrain: an open travel lane flanked by the surrounding sector blocks, which
// intrude from the room's sector-facing borders — left+right for a vertical lane, top+bottom for a
// horizontal one, all four corners for a crossing. Mass depth comes from world-coordinate noise so it
// flows continuously across the shared sector edge of stacked highway rooms, the way real inter-sector
// lanes do. A final pass carves a slot to any exit a mass or lane blob would otherwise seal off, then
// swamp is applied as in normal rooms.
function genHighwayTerrain(
	exits: ExitMap,
	rx: number,
	ry: number,
	orientation: HighwayOrientation,
	swampType: number,
): Grid {
	const grid = makeGrid();
	markExits(grid, exits);
	// Room origin in world tiles; each border's depth is sampled at that border's own world coordinate
	// (left at wox, right at wox+49; top at woy, bottom at woy+49), so the four masses decorrelate and
	// every mass flows continuously into its neighbour across the shared sector edge.
	const wox = rx * 50;
	const woy = ry * 50;
	// Each sector-facing border's mass depth, indexed by the tile along that border, with the mass receding
	// toward its exits (see exitClearance). A vertical lane carries left+right masses, a horizontal one
	// top+bottom, a crossing all four at the shallower corner depth; a border with no mass stays zeroed, so
	// its term below is never the one that walls a tile.
	const mass = orientation === 'crossing' ? kHighwayCornerMass : kHighwayLaneMass;
	// A crossing's corner masses sit off the lanes the exits cross, so nothing seals a throat and no
	// clearance is wanted (it would only erode the corners); its exit set stays empty. Vertical and
	// horizontal lane masses span the exits, so they part for them.
	const exitPoints: [ number, number ][] = orientation === 'crossing' ? [] : [
		...exits.top.map((xx): [ number, number ] => [ xx, 0 ]),
		...exits.bottom.map((xx): [ number, number ] => [ xx, 49 ]),
		...exits.left.map((yy): [ number, number ] => [ 0, yy ]),
		...exits.right.map((yy): [ number, number ] => [ 49, yy ]),
	];
	const leftDepth = new Array(50).fill(0);
	const rightDepth = new Array(50).fill(0);
	const topDepth = new Array(50).fill(0);
	const bottomDepth = new Array(50).fill(0);
	if (orientation !== 'horizontal') {
		for (let yy = 0; yy < 50; yy++) {
			leftDepth[yy] = edgeDepth(wox, woy + yy, mass) * exitClearance(0, yy, exitPoints);
			rightDepth[yy] = edgeDepth(wox + 49, woy + yy, mass) * exitClearance(49, yy, exitPoints);
		}
	}
	if (orientation !== 'vertical') {
		for (let xx = 0; xx < 50; xx++) {
			topDepth[xx] = edgeDepth(wox + xx, woy, mass) * exitClearance(xx, 0, exitPoints);
			bottomDepth[xx] = edgeDepth(wox + xx, woy + 49, mass) * exitClearance(xx, 49, exitPoints);
		}
	}
	for (let yy = 1; yy < 49; yy++) {
		const row = grid[yy]!;
		for (let xx = 1; xx < 49; xx++) {
			const cell = row[xx]!;
			if (cell.forceOpen) continue;
			cell.wall = xx <= leftDepth[yy]! || 49 - xx <= rightDepth[yy]! ||
				yy <= topDepth[xx]! || 49 - yy <= bottomDepth[xx]! ||
				valueNoise(wox + xx, woy + yy, kHighwayBlobCell) > kHighwayBlobThreshold;
		}
	}
	// Frame every non-exit border tile as wall, the way smoothTerrain does for normal rooms.
	for (let ii = 0; ii < 50; ii++) {
		for (const [ xx, yy ] of [ [ ii, 0 ], [ ii, 49 ], [ 0, ii ], [ 49, ii ] ] as const) {
			const cell = grid[yy]![xx]!;
			if (!cell.forceOpen) cell.wall = true;
		}
	}
	connectExits(grid, exits);
	return applySwamp(grid, swampType);
}

// Rooms with three sources (keeper and center rooms) spread their sources across the room rather than
// dropping each on a random wall tile, which clusters them. Every source after the first takes the
// valid wall tile that stays farthest (Chebyshev) from those already placed — chosen with jitter for
// natural variance, and never closer than kMinSourceSpacing. Returns undefined when no tile is far
// enough, signalling the caller to regenerate the terrain.
const kSpreadSourceThreshold = 3;
const kMinSourceSpacing = 14;
const kSpreadJitter = 0.7;

function farthestSourceTile(grid: Grid, placed: [ number, number ][]): [ number, number ] | undefined {
	const candidates: [ number, number, number ][] = [];
	let best = 0;
	for (let yy = 3; yy <= 46; yy++) {
		for (let xx = 3; xx <= 46; xx++) {
			const cell = grid[yy]![xx]!;
			if (!cell.wall || cell.source || !hasPassableNeighbor(grid, xx, yy)) {
				continue;
			}
			let nearest = Infinity;
			for (const [ px, py ] of placed) {
				nearest = Math.min(nearest, Math.max(Math.abs(xx - px), Math.abs(yy - py)));
			}
			candidates.push([ xx, yy, nearest ]);
			if (nearest > best) {
				best = nearest;
			}
		}
	}
	if (best < kMinSourceSpacing) {
		return undefined;
	}
	const threshold = Math.max(kMinSourceSpacing, best * kSpreadJitter);
	const eligible = candidates.filter(candidate => candidate[2] >= threshold);
	const choice = eligible[Math.floor(Math.random() * eligible.length)]!;
	return [ choice[0], choice[1] ];
}

interface TerrainParams {
	wallType: number;
	swampType: number;
	sourceCount: number;
	controller: boolean;
	keeperLairs: boolean;
	mineral: boolean;
}

const kMaxGenerateAttempts = 50;

// Fills the room with cellular-automaton wall (and swamp) noise, rerolling the wall type until the
// open terrain is fully connected, then smooths swamp the same way.
function buildBaseTerrain(exits: ExitMap, wallType: number, swampType: number): Grid {
	let grid: Grid;
	let activeWallType = wallType;
	let tries = 0;
	do {
		grid = makeGrid();
		tries++;
		if (tries > 100) {
			activeWallType = randomWallType();
			tries = 0;
		}

		for (let yy = 0; yy < 50; yy++) {
			const row = grid[yy]!;
			for (let xx = 0; xx < 50; xx++) {
				const cell = row[xx]!;
				if (yy === 0 && exits.top.includes(xx)) {
					cell.forceOpen = true;
					grid[yy + 1]![xx]!.forceOpen = true;
					cell.exit = true;
					continue;
				}
				if (yy === 49 && exits.bottom.includes(xx)) {
					cell.forceOpen = true;
					grid[yy - 1]![xx]!.forceOpen = true;
					cell.exit = true;
					continue;
				}
				if (xx === 0 && exits.left.includes(yy)) {
					cell.forceOpen = true;
					row[xx + 1]!.forceOpen = true;
					cell.exit = true;
					continue;
				}
				if (xx === 49 && exits.right.includes(yy)) {
					cell.forceOpen = true;
					row[xx - 1]!.forceOpen = true;
					cell.exit = true;
					continue;
				}
				cell.wall = Math.random() < wallTypes[activeWallType]!.fill;
				cell.swamp = swampType ? Math.random() < swampTypes[swampType]!.fill : false;
			}
		}

		const wallParams = wallTypes[activeWallType]!;
		for (let ii = 0; ii < wallParams.smooth; ii++) {
			grid = smoothTerrain(grid, wallParams.factor, 'wall');
		}
	} while (!checkFlood(grid));

	if (swampType) {
		const swampParams = swampTypes[swampType]!;
		for (let ii = 0; ii < swampParams.smooth; ii++) {
			grid = smoothTerrain(grid, swampParams.factor, 'swamp');
		}
	}
	return grid;
}

// Places sources, controller, and mineral (with keeper lairs) on the grid. Returns false when a
// spacing constraint can't be satisfied on this terrain, signalling the caller to regenerate.
function tryPlaceObjects(grid: Grid, params: TerrainParams): boolean {
	const { sourceCount, controller, keeperLairs, mineral } = params;
	const spreadSources = sourceCount >= kSpreadSourceThreshold;
	const placedSources: [ number, number ][] = [];
	for (let ii = 0; ii < sourceCount; ii++) {
		let sxx: number;
		let syy: number;

		if (spreadSources && placedSources.length > 0) {
			const tile = farthestSourceTile(grid, placedSources);
			if (!tile) {
				return false;
			}
			[ sxx, syy ] = tile;
		} else {
			let sourceTries = 0;
			do {
				sourceTries++;
				sxx = Math.floor(Math.random() * 44) + 3;
				syy = Math.floor(Math.random() * 44) + 3;
				if (sourceTries > 1000) {
					return false;
				}
			} while (!grid[syy]![sxx]!.wall || !hasPassableNeighbor(grid, sxx, syy));
		}

		grid[syy]![sxx]!.source = true;
		placedSources.push([ sxx, syy ]);

		if (keeperLairs) {
			const spot = findLairSpot(grid, sxx, syy);
			if (!spot) {
				return false;
			}
			grid[spot[1]]![spot[0]]!.keeperLair = true;
		}
	}

	if (controller) {
		let cxx: number;
		let cyy: number;
		let target: Cell;
		let controllerTries = 0;
		do {
			controllerTries++;
			cxx = Math.floor(Math.random() * 40) + 5;
			cyy = Math.floor(Math.random() * 40) + 5;
			target = grid[cyy]![cxx]!;
			if (controllerTries > 1000) {
				return false;
			}
		} while (
			!target.wall ||
			!hasPassableNeighbor(grid, cxx, cyy) ||
			target.source ||
			target.keeperLair
		);
		target.controller = true;
	}

	if (mineral) {
		const { xx, yy } = pickMineralPosition(grid);
		grid[yy]![xx]!.mineral = true;
		if (keeperLairs) {
			const spot = findLairSpot(grid, xx, yy);
			if (!spot) {
				return false;
			}
			grid[spot[1]]![spot[0]]!.keeperLair = true;
		}
	}

	return true;
}

// Generates a normal room's terrain and object placements, retrying with a fresh wall type when the
// layout can't satisfy its spacing constraints, and giving up (rather than looping forever) after a
// bounded number of attempts.
function genTerrain(exits: ExitMap, params: TerrainParams): Grid {
	for (let attempt = 0; attempt < kMaxGenerateAttempts; attempt++) {
		const wallType = attempt === 0 ? params.wallType : randomWallType();
		const grid = buildBaseTerrain(exits, wallType, params.swampType);
		if (tryPlaceObjects(grid, params)) {
			return grid;
		}
	}
	throw new Error(`Could not generate terrain after ${kMaxGenerateAttempts} attempts`);
}

function gridToTerrain(grid: Grid): TerrainWriter {
	const terrain = new TerrainWriter();
	for (let yy = 0; yy < 50; yy++) {
		const row = grid[yy]!;
		for (let xx = 0; xx < 50; xx++) {
			const cell = row[xx]!;
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

function pickMineralPosition(grid: Grid) {
	let mxx: number;
	let myy: number;
	let isWall: boolean;
	let hasSpot: boolean;
	let tooClose: boolean;

	do {
		mxx = 4 + Math.floor(Math.random() * 42);
		myy = 4 + Math.floor(Math.random() * 42);
		isWall = grid[myy]![mxx]!.wall;
		hasSpot = hasPassableNeighbor(grid, mxx, myy);
		tooClose = Fn.some(iterateGridInRange(mxx, myy, 4), ([ xx, yy ]) => {
			const cell = grid[yy]![xx]!;
			return cell.source || cell.controller;
		});
	} while (!isWall || !hasSpot || tooClose);

	return { xx: mxx, yy: myy };
}

function pickMineralDensity(): number {
	const probabilities = C.MINERAL_DENSITY_PROBABILITY;
	const random = Math.random();
	for (let density = 1; density < probabilities.length; density++) {
		if (random <= (probabilities[density] ?? 1)) {
			return density;
		}
	}
	return 1;
}

function placeObjects(
	room: Room,
	grid: Grid,
	roomName: string,
	mineralType: ResourceType | false,
	extractor: boolean,
	sourceEnergyCapacity: number,
): void {
	for (let yy = 0; yy < 50; yy++) {
		const row = grid[yy]!;
		for (let xx = 0; xx < 50; xx++) {
			const cell = row[xx]!;
			if (cell.source) {
				const source = RoomObject.create(new Source(), new RoomPosition(xx, yy, roomName));
				source.energy = source.energyCapacity = sourceEnergyCapacity;
				room['#insertObject'](source);
			}
			if (cell.controller) {
				const controller = RoomObject.create(new StructureController(), new RoomPosition(xx, yy, roomName));
				room['#insertObject'](controller);
			}
			if (cell.keeperLair) {
				const lair = createKeeperLair(new RoomPosition(xx, yy, roomName));
				room['#insertObject'](lair);
			}
			if (cell.mineral && mineralType !== false) {
				const pos = new RoomPosition(xx, yy, roomName);
				const density = pickMineralDensity();
				const mineral = RoomObject.create(new Mineral(), pos);
				mineral.mineralType = mineralType;
				mineral.density = density;
				mineral.mineralAmount = C.MINERAL_DENSITY[density] ?? 0;
				room['#insertObject'](mineral);
				// Source-keeper and center rooms ship a pre-built, unowned extractor so the mineral
				// is harvestable without the player owning it (vanilla blocks harvest only when the
				// extractor belongs to someone else).
				if (extractor) {
					room['#insertObject'](createExtractor(pos));
				}
			}
		}
	}

	room['#flushObjects'](null);
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
				const neighborExits = exitsArray(neighborTerrain.terrain, info.axis, info.fixed);
				const match = neighborExits.length === userExits.length &&
					userExits.every(exit => neighborExits.includes(exit));
				if (!match) {
					throw new Error(`Exits in room ${info.neighborName} don't match`);
				}
			}
			exits[dir] = userExits;
		} else if (neighborTerrain) {
			exits[dir] = exitsArray(neighborTerrain.terrain, info.axis, info.fixed);
		} else {
			exits[dir] = genExit();
		}
	}

	const wallType = options?.terrainType ?? randomWallType();
	const swampType = options?.swampType ??
		(options?.corridor ? rollHighwaySwamp() : Math.floor(Math.random() * (kSwampTypeCount + 1)));
	const sourceCount = options?.sources ?? (Math.random() > 0.5 ? 1 : 2);
	const hasController = options?.controller ?? true;
	const hasKeepers = options?.keeperLairs ?? false;
	const hasExtractor = options?.extractor ?? false;
	const mineralType: ResourceType | false = options?.mineral ??
		mineralPool[Math.floor(Math.random() * mineralPool.length)]!;

	const grid = options?.corridor
		? genHighwayTerrain(exits, rx, ry, highwayOrientation(roomName), swampType)
		: genTerrain(exits, {
			wallType,
			swampType,
			sourceCount,
			controller: hasController,
			keeperLairs: hasKeepers,
			mineral: mineralType !== false,
		});
	const terrain = gridToTerrain(grid);

	// Keeper-guarded sources (source-keeper and center rooms, which have no controller) hold 4000
	// energy; ordinary neutral rooms hold 1500. Source#roomStatusDidChange computes the same thing
	// from the room owner, but the controller processor that runs that hook never fires for a
	// controller-less room, so the capacity is baked in here at generation.
	const sourceEnergyCapacity = hasController
		? C.SOURCE_ENERGY_NEUTRAL_CAPACITY
		: C.SOURCE_ENERGY_KEEPER_CAPACITY;

	const room = new Room();
	room.name = roomName;
	room['#user'] = null;
	room['#level'] = hasController ? 0 : -1;
	placeObjects(room, grid, roomName, mineralType, hasExtractor, sourceEnergyCapacity);
	flushUsers(room);

	return { room, terrain };
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
	if (!/^[WE]\d+[NS]\d+$/.test(roomName)) {
		throw new Error(`Invalid room name: ${roomName}`);
	}

	await ensureWorldTerrain(shard);
	const [ world, existingRooms ] = await Promise.all([ shard.loadWorld(), shard.data.sMembers('rooms') ]);
	if (existingRooms.includes(roomName)) {
		throw new Error(`Room already exists: ${roomName}`);
	}

	const terrainMap = new Map(world.terrain);
	const { room, terrain } = buildRoom(roomName, options, neighborName => terrainMap.get(neighborName));
	terrainMap.set(roomName, { exits: packExits(terrain), terrain });
	await flushRooms(shard, terrainMap, [ room ]);

	return room;
}

// Per-type object loadouts applied over the caller's base options, so the requested type's loadout
// wins. Highways are object-free open corridors; source-keeper rooms hold three guarded sources and
// a guarded mineral with no controller; center rooms are the same but keeper-free; normal rooms keep
// the caller/default loadout (controller + 1-2 sources + mineral).
export const roomTypeTemplates: Record<RoomType, GenerateRoomOptions> = {
	highway: { controller: false, sources: 0, mineral: false, keeperLairs: false, corridor: true },
	sourceKeeper: { controller: false, sources: 3, keeperLairs: true, extractor: true },
	center: { controller: false, sources: 3, keeperLairs: false, extractor: true },
	normal: {},
};
