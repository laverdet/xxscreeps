import type { Shard } from 'xxscreeps/engine/db/index.js';
import type { World } from 'xxscreeps/game/map.js';
import type { Room } from 'xxscreeps/game/room/index.js';
import { registerIntentProcessor, registerShardTickProcessor } from 'xxscreeps/engine/processor/index.js';
import { pushIntentsForRoomNextTick } from 'xxscreeps/engine/processor/model.js';
import { Fn } from 'xxscreeps/functional/fn.js';
import * as C from 'xxscreeps/game/constants/index.js';
import { Game } from 'xxscreeps/game/index.js';
import * as RoomObject from 'xxscreeps/game/object.js';
import { RoomPosition } from 'xxscreeps/game/position.js';
import { Room as RoomClass } from 'xxscreeps/game/room/index.js';
import { isCentralRoom, sectorContainsTile, sectorEdgeRooms, sectorsForRoom } from 'xxscreeps/game/room/sector.js';
import { RESOURCE_BIOMASS, RESOURCE_METAL, RESOURCE_MIST, RESOURCE_SILICON } from 'xxscreeps/mods/factory/constants.js';
import {
	DEPOSIT_DECAY_TIME, DEPOSIT_EXHAUST_MULTIPLY, DEPOSIT_EXHAUST_POW,
} from 'xxscreeps/mods/mineral/constants.js';
import { Deposit } from './deposit.js';

// Cadence ceiling for re-checking a sector when no deposit will decay sooner (~5 min at
// typical tickrate).
const DEPOSIT_CHECK_INTERVAL = 3000;

// A sector needs total throughput below this to gain a new deposit.
const SECTOR_THROUGHPUT_TARGET = 2.5;

const MAX_TILE_ATTEMPTS = 1000;

// FNV-1a used both to pin deposit types and to scatter bootstrap scores per sector.
function fnv1a(str: string): number {
	let hash = 0x811c9dc5;
	for (let ii = 0; ii < str.length; ++ii) {
		hash ^= str.charCodeAt(ii);
		hash = Math.imul(hash, 0x01000193);
	}
	return hash >>> 0;
}

// TODO: hash-derived; imported worlds don't carry the per-room deposit type real Screeps pins at world-gen.
const DEPOSIT_TYPES = [ RESOURCE_SILICON, RESOURCE_METAL, RESOURCE_BIOMASS, RESOURCE_MIST ] as const;
type DepositResource = typeof DEPOSIT_TYPES[number];

export function depositTypeForRoom(roomName: string): DepositResource {
	return DEPOSIT_TYPES[fnv1a(roomName) % DEPOSIT_TYPES.length]!;
}

// Sorted set: score = shard tick when this sector should be re-evaluated, member = central
// room name (e.g. `W5N5`). One row per sector, regardless of how many highway rooms it owns.
const dueSectorsKey = 'deposits/dueSectors';
const bootstrapFlagKey = 'deposits/bootstrapped';
// Hash {centralRoom -> count} of live deposits per sector. Updated on spawn-intent insert and on
// decay; lets `evaluateSector` skip the 40-room throughput scan when a sector is provably empty.
const sectorCountKey = 'deposits/sectorCount';

// `{ earliest: true }` only lowers the existing score (decay path); otherwise the score is
// overwritten (evaluator path pushing the next check forward).
export async function scheduleSector(
	shard: Shard, sector: string, dueAtTick: number, options?: { earliest?: boolean },
) {
	await shard.data.zAdd(dueSectorsKey, [ [ dueAtTick, sector ] ],
		options?.earliest === true ? { up: 'LT' } : undefined);
}

function depositThroughput(harvested: number): number {
	return 20 / Math.max(1, DEPOSIT_EXHAUST_MULTIPLY * harvested ** DEPOSIT_EXHAUST_POW);
}

type SectorEvalResult = {
	throughput: number;
	depositsByRoom: Map<string, Deposit[]>;
	earliestDecayTick: number;
};

async function loadSectorDeposits(
	shard: Shard, world: World, centralRoom: string,
): Promise<SectorEvalResult & { normalEdges: string[] }> {
	// Out-of-borders / closed rooms are excluded from both throughput tallying and spawning.
	const normalEdges = sectorEdgeRooms(centralRoom).filter(name =>
		world.map.getRoomStatus(name).status === 'normal');
	const depositsByRoom = new Map<string, Deposit[]>();
	let throughput = 0;
	let earliestDecayTick = Infinity;
	await Fn.mapAwait(normalEdges, async edgeRoom => {
		const room = await shard.loadRoom(edgeRoom).catch(() => undefined);
		if (room === undefined) return;
		const inSector = sectorContainsTile(centralRoom, edgeRoom);
		const all: Deposit[] = [];
		for (const object of room['#objects']) {
			if (object instanceof Deposit && inSector(object.pos.x, object.pos.y)) {
				all.push(object);
			}
		}
		if (all.length > 0) {
			depositsByRoom.set(edgeRoom, all);
		}
	});
	for (const deposits of depositsByRoom.values()) {
		for (const deposit of deposits) {
			throughput += depositThroughput(deposit['#harvested']);
			const decay = deposit['#nextDecayTime'];
			if (decay > 0 && decay < earliestDecayTick) {
				earliestDecayTick = decay;
			}
		}
	}
	return { throughput, depositsByRoom, earliestDecayTick, normalEdges };
}

type RngFn = () => number;

// Picks a wall tile in 5..44 with at least one non-wall neighbour (incl. diagonals), inside
// the 250-tile sector radius, and 2 tiles clear of any other room object.
function findSpawnTile(
	world: World, centralRoom: string, targetRoom: Room, rng: RngFn,
): { x: number; y: number } | undefined {
	const terrain = world.map.getRoomTerrain(targetRoom.name);
	const objects = targetRoom['#objects'];
	const inSector = sectorContainsTile(centralRoom, targetRoom.name);
	for (let attempt = 0; attempt < MAX_TILE_ATTEMPTS; ++attempt) {
		const xx = Math.floor(rng() * 40) + 5;
		const yy = Math.floor(rng() * 40) + 5;
		if ((terrain.get(xx, yy) & C.TERRAIN_MASK_WALL) === 0) continue;
		if (!inSector(xx, yy)) continue;
		let hasExit = false;
		for (let dx = -1; dx <= 1 && !hasExit; ++dx) {
			for (let dy = -1; dy <= 1 && !hasExit; ++dy) {
				if ((terrain.get(xx + dx, yy + dy) & C.TERRAIN_MASK_WALL) === 0) {
					hasExit = true;
				}
			}
		}
		if (!hasExit) continue;
		let near = false;
		for (const obj of objects) {
			if (Math.abs(obj.pos.x - xx) <= 2 && Math.abs(obj.pos.y - yy) <= 2) {
				near = true;
				break;
			}
		}
		if (near) continue;
		return { x: xx, y: yy };
	}
	return undefined;
}

// Tests can swap in a seeded RNG via `setDepositSpawnRng`.
let rng: RngFn = Math.random;
export function setDepositSpawnRng(fn: RngFn | undefined) {
	rng = fn ?? Math.random;
}

// Bootstrap scatter: spread initial sector seeds across the cadence so all centrals don't
// re-evaluate on the same tick forever. Tests override to a fixed offset for determinism.
type ScatterFn = (roomName: string) => number;
const defaultScatter: ScatterFn = roomName => fnv1a(roomName) % DEPOSIT_CHECK_INTERVAL;
let bootstrapScatter: ScatterFn = defaultScatter;
export function setDepositBootstrapScatterForTest(fn: ScatterFn | undefined) {
	bootstrapScatter = fn ?? defaultScatter;
}

// Helpers for count bookkeeping. Called from the spawn intent (`+1`) and the decay processor
// (`-1`); the count is a precise running total that lets us short-circuit when provably empty.
export async function incrementSectorCount(shard: Shard, centralRoom: string) {
	await shard.data.hincrBy(sectorCountKey, centralRoom, 1);
}
export async function decrementSectorCountForTile(
	shard: Shard, roomName: string, xx: number, yy: number,
) {
	// A given deposit tile belongs to exactly one sector (the 250-tile radius doesn't overlap).
	// Out of the 1–4 candidate sectors for this room, pick the one whose membership predicate
	// actually contains the tile.
	const owning = sectorsForRoom(roomName).find(sector => sectorContainsTile(sector, roomName)(xx, yy));
	if (owning !== undefined) {
		await shard.data.hincrBy(sectorCountKey, owning, -1);
	}
}

function pickRandomFreeRoom(edges: string[], busyRooms: Set<string>): string | undefined {
	const free = edges.filter(name => !busyRooms.has(name));
	if (free.length === 0) return undefined;
	return free[Math.floor(rng() * free.length)];
}

// Push a spawn intent for `candidate` (chosen edge room) into the next tick's processor queue.
async function pushSpawnIntent(shard: Shard, candidate: string, centralRoom: string) {
	const depositType = depositTypeForRoom(candidate);
	// Tile selection happens in the room intent processor so it can read terrain via the live
	// world map — keeps the shard-tick processor purely keyval-bound.
	await pushIntentsForRoomNextTick(shard, candidate, '1', {
		local: { spawnDeposit: [ [ depositType, centralRoom ] ] },
		internal: true,
	});
}

async function evaluateSector(
	shard: Shard, world: World, centralRoom: string, currentTick: number,
): Promise<number> {
	// Precise short-circuit: if no deposits are tracked, throughput is exactly 0 — skip the
	// 40-room scan and push a spawn intent immediately.
	const countStr = await shard.data.hGet(sectorCountKey, centralRoom);
	const count = countStr === null ? 0 : Number(countStr);
	if (count <= 0) {
		const normalEdges = sectorEdgeRooms(centralRoom).filter(name =>
			world.map.getRoomStatus(name).status === 'normal');
		const candidate = pickRandomFreeRoom(normalEdges, new Set());
		if (candidate !== undefined) {
			await pushSpawnIntent(shard, candidate, centralRoom);
		}
		return currentTick + DEPOSIT_CHECK_INTERVAL;
	}
	const { throughput, depositsByRoom, earliestDecayTick, normalEdges } = await loadSectorDeposits(shard, world, centralRoom);
	if (throughput >= SECTOR_THROUGHPUT_TARGET) {
		// Saturated. Next change must come from decay or accrued mining; schedule for the
		// earlier of "next decay" or the cadence ceiling.
		return Math.min(currentTick + DEPOSIT_CHECK_INTERVAL, earliestDecayTick);
	}
	const candidate = pickRandomFreeRoom(normalEdges, new Set(depositsByRoom.keys()));
	if (candidate !== undefined) {
		await pushSpawnIntent(shard, candidate, centralRoom);
	}
	// Whether the room actually accepts the spawn (a stray construction site, etc. could fail
	// tile selection), we re-poll the sector at the cadence ceiling.
	return currentTick + DEPOSIT_CHECK_INTERVAL;
}

async function bootstrap(shard: Shard, world: World) {
	// Stagger seeds across the cadence interval so all centrals don't re-evaluate on the same
	// tick. Relative to `shard.time` so a world imported well past tick 0 (e.g., mod added to
	// an existing shard) still spreads its first wave forward instead of firing all at once.
	// `up: 'LT'` keeps a partial bootstrap from clobbering entries already advanced.
	const seeds: [ number, string ][] = [];
	for (const [ roomName ] of world.entries()) {
		if (isCentralRoom(roomName)) {
			seeds.push([ shard.time + bootstrapScatter(roomName), roomName ]);
		}
	}
	if (seeds.length > 0) {
		await shard.data.zAdd(dueSectorsKey, seeds, { up: 'LT' });
	}
	await shard.data.set(bootstrapFlagKey, '1');
}

// Peek-and-reschedule (no zrem): a crash between peek and reschedule leaves the original entry
// for retry next tick instead of dropping it silently.
registerShardTickProcessor(async shard => {
	const bootstrapDone = await shard.data.get(bootstrapFlagKey);
	let world: World;
	let due: string[];
	if (bootstrapDone === null) {
		// First-time setup. Pay the world load once to seed the schedule.
		world = await shard.loadWorld();
		await bootstrap(shard, world);
		due = await shard.data.zRange(dueSectorsKey, 0, shard.time, { by: 'SCORE' });
	} else {
		// Steady state: cheap keyval check first — skip the world blob fetch on idle ticks.
		due = await shard.data.zRange(dueSectorsKey, 0, shard.time, { by: 'SCORE' });
		if (due.length === 0) return;
		world = await shard.loadWorld();
	}
	await Fn.mapAwait(due, async sector => {
		const nextTick = await evaluateSector(shard, world, sector, shard.time);
		await scheduleSector(shard, sector, nextTick);
	});
});

// Tile selection runs at the room intent stage so it can read terrain via the live `world.map`.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const spawnDepositIntent = registerIntentProcessor(
	RoomClass, 'spawnDeposit', { internal: true },
	(room, context, depositType: DepositResource, centralRoom: string) => {
		const tile = findSpawnTile(context.state.world, centralRoom, room, rng);
		if (tile === undefined) return;
		const deposit = RoomObject.create(new Deposit(), new RoomPosition(tile.x, tile.y, room.name));
		deposit.depositType = depositType;
		deposit['#nextDecayTime'] = Game.time + DEPOSIT_DECAY_TIME;
		room['#insertObject'](deposit);
		context.task(incrementSectorCount(context.shard, centralRoom));
		// The just-inserted deposit's #Tick doesn't fire this tick (post-intent loop iterates a
		// captured `#objects` snapshot), so the explicit wakeAt keeps the room scheduled.
		context.didUpdate();
		context.wakeAt(deposit['#nextDecayTime']);
	});
declare module 'xxscreeps/engine/processor/index.js' {
	interface Intent { deposit: typeof spawnDepositIntent }
}

// Test-only accessors so specs don't have to know the redis key shape.
export async function markBootstrappedForTest(shard: Shard) {
	await shard.data.set(bootstrapFlagKey, '1');
}

export async function inspectDueSectorsForTest(shard: Shard): Promise<[ score: number, sector: string ][]> {
	return shard.data.zRangeWithScores(dueSectorsKey, 0, -1);
}
