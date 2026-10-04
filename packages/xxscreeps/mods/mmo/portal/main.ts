import type { Shard } from 'xxscreeps/engine/db/index.js';
import type { World } from 'xxscreeps/game/map.js';
import type { RoomObject } from 'xxscreeps/game/object.js';
import type { Room } from 'xxscreeps/game/room/index.js';
import { registerShardInitializer, registerShardTickProcessor } from 'xxscreeps/engine/processor/index.js';
import { pushIntentsForRoomNextTick } from 'xxscreeps/engine/processor/model.js';
import { Fn } from 'xxscreeps/functional/fn.js';
import { RoomPosition, iterateInRangeTo } from 'xxscreeps/game/position.js';
import { iterateSectors } from 'xxscreeps/mods/modern/sector/sector.js';
import { StructurePortal } from 'xxscreeps/mods/portal/portal.js';
import { shuffle, shuffledSquare } from 'xxscreeps/utility/random.js';
import * as C from 'xxscreeps:mods/constants';
import { dueSweep } from './model.js';

// Center rooms hold portals in reciprocal pairs of rings, each ring leading into the other. A
// periodic sweep counts the rings standing and, while the world holds fewer pairs than its target,
// places one more. A ring stays stable for `PORTAL_UNSTABLE`, after which the sweep starts its
// `PORTAL_DECAY`, so a later sweep places a replacement somewhere.

// Cadence of the sweep, in wall-clock ms. Tick speeds vary, so the schedule runs on the same clock as
// the stable window it spaces pairs across.
export const kSweepInterval = 5 * 60_000;
const kSweepMember = 'world';

// One pair per eight center rooms, so a world under eight holds none. The live world has measured
// anywhere from 4% to 28% of its center rooms holding a ring, and this puts one in a quarter of them.
const kCentersPerPair = 8;

// A portal still standing. One decaying this tick is still in the room blob at `shard.time + 1`.
function isStandingPortal(shard: Shard, object: RoomObject): object is StructurePortal {
	return object instanceof StructurePortal &&
		(object['#decayTime'] === 0 || object['#decayTime'] > shard.time + 1);
}

// The first position in 4..44, in random order, with no wall under it or any of its eight neighbours
// and no room object in range 1.
function findRingCenter(world: World, room: Room) {
	const terrain = world.map.getRoomTerrain(room.name);
	return Fn.pipe(
		shuffledSquare(4, 41),
		$$ => Fn.map($$, ([ xx, yy ]) => new RoomPosition(xx, yy, room.name)),
		$$ => Fn.filter($$, center => Fn.every(iterateInRangeTo(center, 1), pos => terrain.get(pos.x, pos.y) !== C.TERRAIN_MASK_WALL)),
		$$ => Fn.find($$, center => Fn.every(room['#objects'], object => object.pos.getRangeTo(center) > 1)));
}

// Any id of length <= 2 is a system user, keeping these intents off the player pipeline.
function pushPlaceRing(shard: Shard, center: RoomPosition, partner: RoomPosition, unstableTime: number) {
	return pushIntentsForRoomNextTick(shard, center.roomName, '1', {
		local: { placePortalRing: [ [ center['#id'], partner['#id'], unstableTime ] ] },
		internal: true,
	});
}

function pushDestabilizeRing(shard: Shard, roomName: string) {
	return pushIntentsForRoomNextTick(shard, roomName, '1', {
		local: { destabilizePortalRing: [ [] ] },
		internal: true,
	});
}

// Starts the decay of each ring whose stable window has passed, then, while the world is short of its
// target and the newest pair has had its share of the window, pushes one more pair.
async function sweep(shard: Shard, now: number) {
	const world = await shard.loadWorld();
	const centerNames = Fn.pipe(
		iterateSectors(world),
		$$ => Fn.map($$, ([ center ]) => center),
		// Out-of-borders and closed rooms take no portals
		$$ => Fn.filter($$, roomName => world.map.getRoomStatus(roomName).status === 'normal'),
		$$ => [ ...$$ ]);
	// Only raw `#objects` are read, so the find/look indices are never built
	const centers = await Fn.mapAwait(centerNames, roomName => shard.loadRoom(roomName, shard.time, true));
	const standing = [ ...Fn.transform(centers, room => Fn.filter(room['#objects'], object => isStandingPortal(shard, object))) ];
	// Both rings of a pair share one window, so the same sweep starts them decaying on the same tick
	const lapsed = new Set(Fn.pipe(
		standing,
		$$ => Fn.filter($$, portal => portal['#unstableTime'] !== 0 && now > portal['#unstableTime']),
		$$ => Fn.map($$, portal => portal.pos.roomName)));
	await Fn.mapAwait(lapsed, roomName => pushDestabilizeRing(shard, roomName));
	const targetPairs = Math.floor(centerNames.length / kCentersPerPair);
	const held = new Set(Fn.map(standing, portal => portal.pos.roomName));
	if (held.size >= 2 * targetPairs) {
		return;
	}
	// Each pair waits for its share of the window after the one placed before it, which spreads the
	// pairs' windows across the whole of `PORTAL_UNSTABLE` rather than letting them all run out at once.
	const newestUnstableTime = Math.max(0, ...standing.map(portal => portal['#unstableTime']));
	if (now < newestUnstableTime - C.PORTAL_UNSTABLE + C.PORTAL_UNSTABLE / targetPairs) {
		return;
	}
	const free = [ ...Fn.reject(centers, room => held.has(room.name)) ];
	const [ first, second ] = Fn.pipe(
		shuffle(free),
		$$ => Fn.map($$, room => findRingCenter(world, room)),
		$$ => Fn.filter($$),
		$$ => Fn.take($$, 2),
		$$ => [ ...$$ ]);
	if (first !== undefined && second !== undefined) {
		const unstableTime = now + C.PORTAL_UNSTABLE;
		await Promise.all([
			pushPlaceRing(shard, first, second, unstableTime),
			pushPlaceRing(shard, second, first, unstableTime),
		]);
	}
}

// Seed the schedule once when the shard's services start, due at once.
registerShardInitializer(async shard => {
	await dueSweep.seed(shard, [ [ Date.now(), kSweepMember ] ]);
});

// Peek-and-reschedule, as deposits do: a crash between the two leaves the row due for a retry.
registerShardTickProcessor(async shard => {
	const now = Date.now();
	const due = await dueSweep.due(shard, now);
	if (due.length === 0) {
		return;
	}
	await sweep(shard, now);
	await dueSweep.schedule(shard, kSweepMember, now + kSweepInterval);
});
