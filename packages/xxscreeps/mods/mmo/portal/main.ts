import type { Shard } from 'xxscreeps/engine/db/index.js';
import type { GameState } from 'xxscreeps/game/game.js';
import type { World } from 'xxscreeps/game/map.js';
import type { RoomObject } from 'xxscreeps/game/object.js';
import type { Room } from 'xxscreeps/game/room/index.js';
import { registerShardInitializer, registerShardTickProcessor } from 'xxscreeps/engine/processor/index.js';
import { pushIntentsForRoomNextTick } from 'xxscreeps/engine/processor/model.js';
import { Fn } from 'xxscreeps/functional/fn.js';
import { runWithState } from 'xxscreeps/game/index.js';
import { expiresNextTick } from 'xxscreeps/game/object.js';
import { RoomPosition, iterateInRangeTo } from 'xxscreeps/game/position.js';
import { iterateSectors } from 'xxscreeps/mods/modern/sector/sector.js';
import { StructurePortal } from 'xxscreeps/mods/portal/portal.js';
import { shuffle, shuffledSquare } from 'xxscreeps/utility/random.js';
import * as C from 'xxscreeps:mods/constants';
import { isSweepDue, scheduleSweep } from './model.js';

// Places portals in sector center rooms. Portals rings come in linked pairs, and each portal is eight
// `StructurePortal`s around an open tile. The world keeps one pair per `kCentersPerPair` center rooms.
//
// A portal is stable for `PORTAL_UNSTABLE` ms of wall time, then decays for `PORTAL_DECAY` ticks and
// disappears. Once it's gone a new pair is placed somewhere else.

// How long to wait before trying again when no room has space for a portal, in ms of wall time.
const kPlacementRetryInterval = 5 * 60_000;

// One pair per eight center rooms, so a world under eight holds none. The live world has measured
// anywhere from 4% to 28% of its center rooms holding a portal, and this puts one in a quarter of
// them.
const kSectorsPerPair = 8;

// True for portals which will still exist after this tick. A portal on its last tick is still in the
// loaded room, but the room processor removes it this tick. This reads `Game.time`, so it must be
// called inside `runWithState`.
function isStandingPortal(object: RoomObject): object is StructurePortal {
	return object instanceof StructurePortal && !expiresNextTick(object['#decayTime']);
}

// The first position in 4..44, in random order, with no wall under it or any of its eight neighbours
// and no room object in range 1.
function selectPlacement(world: World, room: Room) {
	const terrain = world.map.getRoomTerrain(room.name);
	return Fn.pipe(
		shuffledSquare(4, 41),
		$$ => Fn.map($$, ([ xx, yy ]) => new RoomPosition(xx, yy, room.name)),
		$$ => Fn.filter($$, placement => Fn.every(iterateInRangeTo(placement, 1), pos => terrain.get(pos.x, pos.y) !== C.TERRAIN_MASK_WALL)),
		$$ => Fn.find($$, placement => Fn.every(room['#objects'], object => object.pos.getRangeTo(placement) > 1)));
}

function pushPlacement(shard: Shard, placement: RoomPosition, partner: RoomPosition, unstableTime: number) {
	return pushIntentsForRoomNextTick(shard, placement.roomName, '1', {
		internal: true,
		local: { placePortalRing: [ [ placement['#id'], partner['#id'], unstableTime ] ] },
	});
}

function pushDestabilization(shard: Shard, roomName: string) {
	return pushIntentsForRoomNextTick(shard, roomName, '1', {
		internal: true,
		local: { destabilizePortalRing: [ [] ] },
	});
}

// Starts decay on portals whose unstable time has arrived, then places a new pair if the world is below
// its target. Returns the wall time of the next sweep, or `Infinity` if there is nothing to wait for.
async function sweep(shard: Shard, state: GameState, now: number) {
	const world = await shard.loadWorld();
	// Load participating sector center rooms
	const sectorRooms = await Fn.pipe(
		iterateSectors(world),
		$$ => Fn.map($$, ([ center ]) => center),
		// Out-of-borders and closed rooms take no portals
		$$ => Fn.filter($$, roomName => world.map.getRoomStatus(roomName).status === 'normal'),
		$$ => Fn.mapAwait($$, roomName => shard.loadRoom(roomName, shard.time, true)));
	// Extract all non-decayed portals
	const standingPortals = runWithState(state, () => Fn.pipe(
		sectorRooms,
		$$ => Fn.transform($$, room => room['#objects']),
		$$ => Fn.filter($$, isStandingPortal),
		$$ => [ ...$$ ]));
	// Start destabilization (decay game timer) of portals
	await Fn.pipe(
		standingPortals,
		$$ => Fn.filter($$, portal => portal['#unstableTime'] !== 0 && now >= portal['#unstableTime']),
		$$ => Fn.map($$, portal => portal.pos.roomName),
		$$ => new Set($$),
		$$ => Fn.mapAwait($$, roomName => pushDestabilization(shard, roomName)));
	// Check if world has desired count of portal pairs
	const targetRooms = Math.floor(sectorRooms.length / kSectorsPerPair) * 2;
	const activeRooms = new Set(Fn.map(standingPortals, portal => portal.pos.roomName));
	const nextUnstableTime = Fn.pipe(
		standingPortals,
		$$ => Fn.map($$, portal => portal['#unstableTime']),
		$$ => Fn.filter($$, unstableTime => now < unstableTime),
		$$ => Math.min(Infinity, ...$$));
	if (activeRooms.size >= targetRooms) {
		return nextUnstableTime;
	}
	// Stagger placements so that portals don't all expire at the same time. A new pair waits
	// `PORTAL_UNSTABLE` divided by the target number of pairs after the previous pair was placed.
	const placementInterval = 2 * C.PORTAL_UNSTABLE / targetRooms;
	const placementTime =
		Math.max(0, ...Fn.map(standingPortals, portal => portal['#unstableTime'])) - C.PORTAL_UNSTABLE + placementInterval;
	if (now < placementTime) {
		return Math.min(nextUnstableTime, placementTime);
	}
	const freeRooms = [ ...Fn.reject(sectorRooms, room => activeRooms.has(room.name)) ];
	const [ first, second ] = Fn.pipe(
		shuffle(freeRooms),
		$$ => Fn.map($$, room => selectPlacement(world, room)),
		$$ => Fn.filter($$),
		$$ => Fn.take($$, 2),
		$$ => [ ...$$ ]);
	if (!first || !second) {
		return Math.min(nextUnstableTime, now + kPlacementRetryInterval);
	}
	const unstableTime = now + C.PORTAL_UNSTABLE;
	await Promise.all([
		pushPlacement(shard, first, second, unstableTime),
		pushPlacement(shard, second, first, unstableTime),
	]);
	// Sweep again when the next pair can be placed. If the world is now full then nothing happens until
	// this pair goes unstable.
	const nextPlacement = activeRooms.size + 2 < targetRooms ? now + placementInterval : Infinity;
	return Math.min(nextUnstableTime, unstableTime, nextPlacement);
}

registerShardInitializer(async shard => {
	await scheduleSweep(shard, Date.now());
});

registerShardTickProcessor(async (shard, state) => {
	const now = Date.now();
	if (await isSweepDue(shard, now)) {
		await scheduleSweep(shard, await sweep(shard, state, now));
	}
});
