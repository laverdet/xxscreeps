import type { StrongholdTemplate } from './templates.js';
import type { Shard } from 'xxscreeps/engine/db/index.js';
import type { GameState } from 'xxscreeps/game/game.js';
import type { World } from 'xxscreeps/game/map.js';
import type { RoomObject } from 'xxscreeps/game/object.js';
import type { Room } from 'xxscreeps/game/room/index.js';
import { registerShardInitializer, registerShardTickProcessor } from 'xxscreeps/engine/processor/index.js';
import { pushIntentsForRoomNextTick } from 'xxscreeps/engine/processor/model.js';
import { Fn } from 'xxscreeps/functional/fn.js';
import { nonNullPredicate } from 'xxscreeps/functional/predicate.js';
import { runWithState } from 'xxscreeps/game/index.js';
import { RoomPosition } from 'xxscreeps/game/position.js';
import { kInvaderUserId } from 'xxscreeps/mods/classic/invader/game.js';
import { Structure } from 'xxscreeps/mods/classic/structure/structure.js';
import { iterateSectors } from 'xxscreeps/mods/modern/sector/sector.js';
import { shuffle, shuffledSquare } from 'xxscreeps/utility/random.js';
import * as C from 'xxscreeps:mods/constants';
import { dueSweeps, holdsStronghold, loadSectorKeeperRooms, scheduleSweep, seedSweeps } from './model.js';
import { templateEntries } from './templates.js';

// Strongholds are placed one per sector, in one of its source-keeper rooms. Each sector is swept on
// the wall clock, and a sector holding neither a core nor the ruin of one gains a stronghold. The room
// processor requests the next sweep when the core collapses, its ruin decays, or a nuke lands in its
// room. The sweep after tick T reads rooms as T began, so its liveness filters predict the removals
// T made, and a nuke, whose kill nothing predicts, requests on the pass that removes it.

// How long to wait before trying again when no keeper room has space for a stronghold, in ms of wall
// time. Each sector's first sweep after the shard starts is spread across it too.
export const kPlacementRetryInterval = 5 * 60_000;

// Objects a template may not land on: the pathing obstacles plus ramparts. A structure is matched by
// its structure type, and anything else by its look type.
const kPlacementObstacles = new Set<string | null>([ C.STRUCTURE_RAMPART, ...C.OBSTACLE_OBJECT_TYPES ]);
const blocksPlacement = (object: RoomObject) =>
	kPlacementObstacles.has(object instanceof Structure ? object.structureType : object['#lookType']);

// A template and the position of the core it deploys around, chosen uniformly: the first template, in
// random order, which fits somewhere in the 4..44 band, at the first position in that band's own
// random order where it fits. A template fits where none of its structures lands on a wall or an
// obstacle.
function selectPlacement(world: World, room: Room) {
	const terrain = world.map.getRoomTerrain(room.name);
	const blocked = Fn.pipe(
		room['#objects'],
		$$ => Fn.filter($$, blocksPlacement),
		$$ => Fn.map($$, object => object.pos['#id']),
		$$ => new Set($$));
	const fits = (template: StrongholdTemplate, xx: number, yy: number) =>
		Fn.every(template.structures, entry => {
			const pos = new RoomPosition(xx + entry.dx, yy + entry.dy, room.name);
			return terrain.get(pos.x, pos.y) !== C.TERRAIN_MASK_WALL && !blocked.has(pos['#id']);
		});
	return Fn.pipe(
		shuffle(templateEntries),
		$$ => Fn.map($$, ([ templateName, template ]) => {
			const spot = Fn.find(shuffledSquare(4, 41), ([ xx, yy ]) => fits(template, xx, yy));
			return spot === undefined ? undefined : { templateName, pos: new RoomPosition(spot[0], spot[1], room.name) };
		}),
		$$ => Fn.find($$, nonNullPredicate));
}

// Places a stronghold in the sector centered on `center` unless one already holds it. Returns the
// wall time of the sector's next sweep, or `Infinity` if there is nothing to wait for.
async function sweep(shard: Shard, state: GameState, world: World, center: string, now: number) {
	const rooms = await loadSectorKeeperRooms(shard, world, center);
	if (runWithState(state, () => rooms.some(room => holdsStronghold(room)))) {
		return Infinity;
	}
	const placement = Fn.pipe(
		rooms,
		// Out-of-borders and closed rooms take no stronghold
		$$ => $$.filter(room => world.map.getRoomStatus(room.name).status === 'normal'),
		$$ => shuffle($$),
		$$ => Fn.map($$, room => selectPlacement(world, room)),
		$$ => Fn.find($$, nonNullPredicate));
	if (placement === undefined) {
		return now + kPlacementRetryInterval;
	}
	// The invader NPC owns what it places
	await pushIntentsForRoomNextTick(shard, placement.pos.roomName, kInvaderUserId, {
		internal: true,
		local: { placeStronghold: [ [ placement.templateName, placement.pos['#id'] ] ] },
	});
	return Infinity;
}

// Seed the schedule once when the shard's services start. Bootstrapping here, rather than behind a
// per-tick "already bootstrapped?" database read, keeps the steady-state tick free of setup I/O.
registerShardInitializer(async shard => {
	const now = Date.now();
	const world = await shard.loadWorld();
	// Stagger seeds across the interval so all centers don't sweep at the same wall time. Relative to
	// the current wall clock so a world imported well past tick 0 (e.g. the mod added to an existing
	// shard) still spreads its first wave forward instead of firing all at once.
	const seeds = [ ...Fn.map(iterateSectors(world), ([ center ]): [ score: number, sector: string ] =>
		[ now + Math.floor(Math.random() * kPlacementRetryInterval), center ]) ];
	if (seeds.length > 0) {
		await seedSweeps(shard, seeds);
	}
});

// Peek-and-reschedule (no zrem): a crash between peek and reschedule leaves the original entry for
// retry next tick instead of dropping it silently.
registerShardTickProcessor(async (shard, state) => {
	const now = Date.now();
	const due = await dueSweeps(shard, now);
	if (due.length === 0) {
		return;
	}
	const world = await shard.loadWorld();
	await Fn.mapAwait(due, async center => {
		await scheduleSweep(shard, center, await sweep(shard, state, world, center, now));
	});
});
