import type { Shard } from 'xxscreeps/engine/db/index.js';
import type { World } from 'xxscreeps/game/map.js';
import { registerIntentProcessor, registerShardInitializer, registerShardTickProcessor } from 'xxscreeps/engine/processor/index.js';
import { pushIntentsForRoomNextTick } from 'xxscreeps/engine/processor/model.js';
import { Fn } from 'xxscreeps/functional/fn.js';
import * as C from 'xxscreeps/game/constants/index.js';
import { Game } from 'xxscreeps/game/index.js';
import * as RoomObject from 'xxscreeps/game/object.js';
import { RoomPosition } from 'xxscreeps/game/position.js';
import { Room as RoomClass } from 'xxscreeps/game/room/index.js';
import { isCentralRoom, makeSectorRadiusFilter, sectorEdgeRooms } from 'xxscreeps/game/room/sector.js';
import { DEPOSIT_DECAY_TIME, DEPOSIT_EXHAUST_MULTIPLY, DEPOSIT_EXHAUST_POW } from 'xxscreeps/mods/mineral/constants.js';
import { Deposit } from './deposit.js';
import { dueSectorsAt, scheduleSector, seedSectors } from './model.js';

// Deposits are placed in highway-room sectors: a per-sector wall-clock schedule drives periodic
// evaluation, and a sector below its throughput target gains a deposit. Decay events pull a
// sector's next evaluation forward the moment capacity frees.

// Cadence ceiling for re-checking a sector, in wall-clock ms. Tick speeds vary and rarely run at
// their configured pace, so the schedule stays wall-clock rather than tick-domain.
const DEPOSIT_CHECK_INTERVAL = 5 * 60_000;

// A sector needs total throughput below this to gain a new deposit.
const SECTOR_THROUGHPUT_TARGET = 2.5;

const MAX_PLACEMENT_ATTEMPTS = 1000;

// FNV-1a used both to pin deposit types and to scatter bootstrap scores per sector.
function fnv1a(str: string): number {
	let hash = 0x811c9dc5;
	for (let ii = 0; ii < str.length; ++ii) {
		hash ^= str.charCodeAt(ii);
		hash = Math.imul(hash, 0x01000193);
	}
	return hash;
}

// TODO: hash-derived; imported worlds don't carry the per-room deposit type real Screeps pins at world-gen.
const DEPOSIT_TYPES = [ C.RESOURCE_SILICON, C.RESOURCE_METAL, C.RESOURCE_BIOMASS, C.RESOURCE_MIST ] as const;
type DepositResource = typeof DEPOSIT_TYPES[number];

export function depositTypeForRoom(roomName: string): DepositResource {
	return DEPOSIT_TYPES[Math.abs(fnv1a(roomName) % DEPOSIT_TYPES.length)]!;
}

function depositThroughput(harvested: number): number {
	return 20 / Math.max(1, DEPOSIT_EXHAUST_MULTIPLY * harvested ** DEPOSIT_EXHAUST_POW);
}

// Surviving in-sector deposits per normal edge room (one group per room, empties included).
export async function loadSectorDeposits(shard: Shard, centralRoom: string, normalEdges: string[]): Promise<Deposit[]> {
	const depositsByRoom = await Fn.mapAwait(normalEdges, async edgeRoom => {
		const room = await shard.loadRoom(edgeRoom);
		const inSector = makeSectorRadiusFilter(centralRoom, edgeRoom);
		return room['#objects'].filter((object): object is Deposit =>
			object instanceof Deposit && inSector(object.pos.x, object.pos.y));
	});
	return [ ...Fn.concat<Deposit>(depositsByRoom) ];
}

// Tests swap in a seeded RNG via `setDepositPlaceRandomForTesting`.
type RngFn = () => number;
let rng: RngFn = Math.random;
export function setDepositPlaceRandomForTesting(fn: RngFn): Disposable {
	const previous = rng;
	rng = fn;
	return { [Symbol.dispose]() { rng = previous; } };
}

// Bootstrap scatter spreads initial sector seeds across the cadence so all centrals don't come due
// at the same wall time forever. Tests override to a fixed offset for determinism.
type ScatterFn = (roomName: string) => number;
const defaultScatter: ScatterFn = roomName => Math.abs(fnv1a(roomName) % DEPOSIT_CHECK_INTERVAL);
let bootstrapScatter = defaultScatter;
export function setDepositBootstrapScatterForTesting(scatter: ScatterFn): Disposable {
	const previous = bootstrapScatter;
	bootstrapScatter = scatter;
	return { [Symbol.dispose]() { bootstrapScatter = previous; } };
}

// Picks a wall position in 5..44 with at least one non-wall neighbor (incl. diagonals), inside the
// sector's 250-square radius, and 2 squares clear of any other room object.
function findPlacement(world: World, centralRoom: string, targetRoom: RoomClass) {
	const terrain = world.map.getRoomTerrain(targetRoom.name);
	const objects = targetRoom['#objects'];
	const inSector = makeSectorRadiusFilter(centralRoom, targetRoom.name);
	for (let attempt = 0; attempt < MAX_PLACEMENT_ATTEMPTS; ++attempt) {
		const xx = Math.floor(rng() * 40) + 5;
		const yy = Math.floor(rng() * 40) + 5;
		if (terrain.get(xx, yy) !== C.TERRAIN_MASK_WALL) {
			continue;
		}
		// Divergence from the official cron, which computes this check but never enforces it.
		if (!inSector(xx, yy)) {
			continue;
		}
		const hasExit = (() => {
			for (let dx = -1; dx <= 1; ++dx) {
				for (let dy = -1; dy <= 1; ++dy) {
					if (terrain.get(xx + dx, yy + dy) !== C.TERRAIN_MASK_WALL) {
						return true;
					}
				}
			}
			return false;
		})();
		if (!hasExit) {
			continue;
		}
		if (Fn.some(objects, object => object.pos.getRangeTo(xx, yy) <= 2)) {
			continue;
		}
		return { xx, yy } as const;
	}
}

function pickRandomFreeRoom(edges: string[], busyRooms: Set<string>): string | undefined {
	const free = [ ...Fn.reject(edges, name => busyRooms.has(name)) ];
	return free[Math.floor(rng() * free.length)];
}

// Push a placement intent for `candidate` (chosen edge room) into the next tick's processor queue.
async function pushPlaceIntent(shard: Shard, candidate: string, centralRoom: string) {
	const depositType = depositTypeForRoom(candidate);
	// Placement happens in the room intent processor so it can read terrain via the live world
	// map — keeps the shard-tick processor purely keyval-bound. Any id of length <= 2 is a system
	// user (`isSystemUser`), keeping the intent off the player pipeline.
	await pushIntentsForRoomNextTick(shard, candidate, '1', {
		local: { placeDeposit: [ [ depositType, centralRoom ] ] },
		internal: true,
	});
}

async function evaluateSector(shard: Shard, world: World, centralRoom: string) {
	// Out-of-borders / closed rooms are excluded from both throughput tallying and placement.
	const normalEdges = [ ...Fn.filter(sectorEdgeRooms(centralRoom), name =>
		world.map.getRoomStatus(name).status === 'normal') ];
	const deposits = await loadSectorDeposits(shard, centralRoom, normalEdges);
	const throughput = Fn.accumulate(Fn.map(deposits, deposit => depositThroughput(deposit['#harvested'])));
	if (throughput >= SECTOR_THROUGHPUT_TARGET) {
		// Saturated. The decay hook pulls the schedule forward the moment capacity frees.
		return;
	}
	const busyRooms = new Set(Fn.map(deposits, deposit => deposit.room.name));
	const candidate = pickRandomFreeRoom(normalEdges, busyRooms);
	if (candidate !== undefined) {
		await pushPlaceIntent(shard, candidate, centralRoom);
	}
}

// Seed the schedule once when the shard's services start. Bootstrapping here, rather than behind a
// per-tick "already bootstrapped?" database read, keeps the steady-state tick free of setup I/O.
registerShardInitializer(async shard => {
	const now = Date.now();
	const world = await shard.loadWorld();
	// Stagger seeds across the cadence so all centrals don't re-evaluate at the same wall time.
	// Relative to the current wall clock so a world imported well past tick 0 (e.g. the mod added to
	// an existing shard) still spreads its first wave forward instead of firing all at once.
	const seeds = Fn.pipe(
		world.entries(),
		$$ => Fn.filter($$, ([ roomName ]) => isCentralRoom(roomName)),
		$$ => Fn.map($$, ([ roomName ]): [ score: number, sector: string ] => [ now + bootstrapScatter(roomName), roomName ]),
		$$ => [ ...$$ ],
	);
	if (seeds.length > 0) {
		await seedSectors(shard, seeds);
	}
});

// Peek-and-reschedule (no zrem): a crash between peek and reschedule leaves the original entry for
// retry next tick instead of dropping it silently.
registerShardTickProcessor(async shard => {
	const now = Date.now();
	const due = await dueSectorsAt(shard, now);
	if (due.length === 0) {
		return;
	}
	const world = await shard.loadWorld();
	await Fn.mapAwait(due, async sector => {
		await evaluateSector(shard, world, sector);
		// Re-poll at the cadence ceiling whether or not a deposit lands (placement can fail);
		// decay pulls the schedule forward sooner.
		await scheduleSector(shard, sector, now + DEPOSIT_CHECK_INTERVAL);
	});
});

// Placement runs at the room intent stage so it can read terrain via the live `world.map`.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const placeDepositIntent = registerIntentProcessor(
	RoomClass, 'placeDeposit', { internal: true },
	(room, context, depositType: DepositResource, centralRoom: string) => {
		const pos = findPlacement(context.state.world, centralRoom, room);
		if (pos === undefined) {
			return;
		}
		const deposit = RoomObject.create(new Deposit(), new RoomPosition(pos.xx, pos.yy, room.name));
		deposit.depositType = depositType;
		deposit['#nextDecayTime'] = Game.time + DEPOSIT_DECAY_TIME;
		room['#insertObject'](deposit);
		// The just-inserted deposit's #Tick doesn't fire this tick (post-intent loop iterates a
		// captured `#objects` snapshot), so the explicit wakeAt keeps the room scheduled.
		context.didUpdate();
		context.wakeAt(deposit['#nextDecayTime']);
	});
declare module 'xxscreeps/engine/processor/index.js' {
	interface Intent { deposit: typeof placeDepositIntent }
}
