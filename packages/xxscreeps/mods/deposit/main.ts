import type { Shard } from 'xxscreeps/engine/db/index.js';
import type { World } from 'xxscreeps/game/map.js';
import * as assert from 'node:assert';
import { registerShardInitializer, registerShardTickProcessor } from 'xxscreeps/engine/processor/index.js';
import { pushIntentsForRoomNextTick } from 'xxscreeps/engine/processor/model.js';
import { Fn } from 'xxscreeps/functional/fn.js';
import * as C from 'xxscreeps/game/constants/index.js';
import { makeSectorRadiusPredicate } from 'xxscreeps/game/room/sector.js';
import { DEPOSIT_EXHAUST_MULTIPLY, DEPOSIT_EXHAUST_POW } from 'xxscreeps/mods/mineral/constants.js';
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
export type DepositResource = typeof DEPOSIT_TYPES[number];

export function depositTypeForRoom(roomName: string): DepositResource {
	return DEPOSIT_TYPES[Math.abs(fnv1a(roomName) % DEPOSIT_TYPES.length)]!;
}

function depositThroughput(harvested: number): number {
	return 20 / Math.max(1, DEPOSIT_EXHAUST_MULTIPLY * harvested ** DEPOSIT_EXHAUST_POW);
}

// Surviving in-sector deposits per normal edge room (one group per room, empties included).
export async function loadSectorDeposits(shard: Shard, world: World, centralRoom: string, normalEdges: string[]): Promise<Deposit[]> {
	const depositsByRoom = await Fn.mapAwait(normalEdges, async edgeRoom => {
		const sectors = world.map['#getRoomTraits'](edgeRoom)!.sectors;
		const room = await shard.loadRoom(edgeRoom);
		const inSector = makeSectorRadiusPredicate(centralRoom, edgeRoom, sectors);
		return room['#objects'].filter((object): object is Deposit =>
			object instanceof Deposit &&
			object['#nextDecayTime'] > shard.time + 1 &&
			inSector(object.pos.x, object.pos.y));
	});
	return [ ...Fn.concat<Deposit>(depositsByRoom) ];
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

function pickRandomFreeRoom(edges: string[], busyRooms: Set<string>): string | undefined {
	const free = [ ...Fn.reject(edges, name => busyRooms.has(name)) ];
	return free[Math.floor(Math.random() * free.length)];
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
	const sectorControl = world.map['#getRoomTraits'](centralRoom)?.sectorControl;
	assert.ok(sectorControl);
	// Out-of-borders / closed rooms are excluded from both throughput tallying and placement.
	const normalEdges = sectorControl.edges.filter(name => world.map.getRoomStatus(name).status === 'normal');
	const deposits = await loadSectorDeposits(shard, world, centralRoom, normalEdges);
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
		world.map['#sectors'](),
		$$ => Fn.map($$, ([ center ]): [ score: number, sector: string ] => [ now + bootstrapScatter(center), center ]),
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
