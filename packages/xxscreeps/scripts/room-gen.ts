import type { Shard } from 'xxscreeps/engine/db/index.js';
import { Fn } from 'xxscreeps/functional/fn.js';
import * as C from 'xxscreeps/game/constants/index.js';
import { makeLocalIterateInRangeTo } from 'xxscreeps/game/direction.js';
import * as MapSchema from 'xxscreeps/game/map.js';
import { Room } from 'xxscreeps/game/room/index.js';
import { makeRoomName, makeSignedRoomName, parseRoomName, parseSignedRoomName } from 'xxscreeps/game/room/name.js';
import { flushUsers } from 'xxscreeps/game/room/room.js';
import { Terrain, TerrainWriter, isBorder, packExits } from 'xxscreeps/game/terrain.js';
import { computeRoomMeta } from 'xxscreeps/mods/sector/sector.js';
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

function *exitsArray(terrain: Terrain, axis: 'x' | 'y', fixed: number) {
	for (let ii = 0; ii < 50; ++ii) {
		const xx = axis === 'x' ? fixed : ii;
		const yy = axis === 'x' ? ii : fixed;
		if (terrain.get(xx, yy) !== C.TERRAIN_MASK_WALL) {
			yield ii;
		}
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
		tries++;
		if (tries > 100) {
			activeWallType = randomWallType();
			tries = 0;
		}

		for (const [ yy, row ] of grid.entries()) {
			for (const [ xx, cell ] of row.entries()) {
				if (yy === 0 && exits.top.includes(xx)) {
					cell.forceOpen = true;
					grid[yy + 1]![xx]!.forceOpen = true;
					continue;
				}
				if (yy === 49 && exits.bottom.includes(xx)) {
					cell.forceOpen = true;
					grid[yy - 1]![xx]!.forceOpen = true;
					continue;
				}
				if (xx === 0 && exits.left.includes(yy)) {
					cell.forceOpen = true;
					row[xx + 1]!.forceOpen = true;
					continue;
				}
				if (xx === 49 && exits.right.includes(yy)) {
					cell.forceOpen = true;
					row[xx - 1]!.forceOpen = true;
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

// Builds a room's terrain entirely in memory; performs no storage I/O. `lookupTerrain` resolves an
// already-built neighbor's terrain so shared exits line up.
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
		} else {
			exits[dir] = [ ...genExit() ];
		}
	}

	const wallType = options?.terrainType ?? randomWallType();
	const swampType = options?.swampType ?? Math.floor(Math.random() * 14);

	const grid = buildBaseTerrain(exits, wallType, swampType);
	const terrain = gridToTerrain(grid);

	const room = new Room();
	room.name = roomName;
	room['#user'] = null;
	room['#level'] = -1;
	room['#flushObjects'](null);
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
	const roomNames = new Set([ ...terrainMap.keys(), roomName ]);
	terrainMap.set(roomName, { exits: packExits(terrain), terrain, ...computeRoomMeta(roomName, roomNames) });
	// Sector relationships are stored bidirectionally, so a room landing can extend the records of
	// rooms generated earlier -- an existing member gains this center, a center gains this member.
	for (const [ xx, yy ] of iterateRoomsInRange(rx, ry, 5)) {
		const neighborName = makeSignedRoomName(xx, yy);
		const record = terrainMap.get(neighborName);
		if (record && neighborName !== roomName) {
			terrainMap.set(neighborName, { ...record, ...computeRoomMeta(neighborName, roomNames) });
		}
	}
	await flushRooms(shard, terrainMap, [ room ]);

	return room;
}
