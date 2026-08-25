import type { Shard } from 'xxscreeps/engine/db/index.js';
import type { World } from 'xxscreeps/game/map.js';
import type { RoomObject } from 'xxscreeps/game/object.js';
import type { Room } from 'xxscreeps/game/room/index.js';
import * as assert from 'node:assert';
import { makeDueSet } from 'xxscreeps/engine/processor/shard.js';
import { Fn } from 'xxscreeps/functional/fn.js';
import { expiresNextTick } from 'xxscreeps/game/object.js';
import { Ruin } from 'xxscreeps/mods/classic/structure/ruin.js';
import { keeperRooms } from 'xxscreeps/mods/modern/sector/sector.js';
import * as C from 'xxscreeps:mods/constants';
import { StructureInvaderCore } from './invader-core.js';

// Wall time, in ms, of each sector's next sweep, keyed by the sector's center room (e.g. `W5N5`). A
// sector's row is removed while a stronghold holds it.
const dueSectors = makeDueSet('strongholds/dueSectors');

// Center rooms of the sectors whose sweep should run at wall time `now`.
export function dueSweeps(shard: Shard, now: number) {
	return dueSectors.due(shard, now);
}

// Schedules each sector's first sweep when the shard starts.
export async function seedSweeps(shard: Shard, sweeps: [ time: number, center: string ][]) {
	await dueSectors.seed(shard, sweeps);
}

// Sets the wall time of the next sweep of the sector centered on `center`, replacing any time
// already scheduled. `Infinity` leaves no sweep scheduled.
export async function scheduleSweep(shard: Shard, center: string, time: number) {
	if (time === Infinity) {
		await dueSectors.cancel(shard, center);
	} else {
		await dueSectors.schedule(shard, center, time);
	}
}

// Makes the sweep of every sector `roomName` belongs to run on the current tick, whatever time it was
// scheduled for.
export async function requestSweeps(shard: Shard, world: World, roomName: string) {
	const { sectors } = world.map['#getRoomTraits'](roomName);
	await Fn.mapAwait(sectors, center => dueSectors.schedule(shard, center, 0, { earliest: true }));
}

export function sweepsForTesting(shard: Shard) {
	return dueSectors.entriesForTest(shard);
}

// The source-keeper rooms of every sector `roomName` belongs to. A stronghold only ever stands in
// one of these, so they are both the placement candidates for a sector and the rooms a sector-wide
// core check has to scan.
export function loadSectorKeeperRooms(shard: Shard, world: World, roomName: string) {
	const { sectors } = world.map['#getRoomTraits'](roomName);
	return Fn.mapAwait(
		Fn.transform(sectors, center => {
			const { sectorControl } = world.map['#getRoomTraits'](center);
			assert.ok(sectorControl, `Room ${center} carries no sector record`);
			return keeperRooms(center, sectorControl);
		}),
		// Callers only read raw `#objects`, so the find/look indices are never built
		name => shard.loadRoom(name, undefined, true));
}

// True for cores which will still exist after this tick. A core collapsing this tick is still in the
// loaded room, but the room processor removes it this tick, and one which hasn't deployed yet
// carries no collapse timer at all. This reads `Game.time`, so it must be called inside
// `runWithState`.
function isStandingCore(object: RoomObject): object is StructureInvaderCore {
	return object instanceof StructureInvaderCore && !expiresNextTick(object['#collapseTime']);
}

// True for a room holding a standing core or the ruin of one which will still exist after this tick.
// This reads `Game.time`, so it must be called inside `runWithState`.
export function holdsStronghold(room: Room) {
	return Fn.some(room['#objects'], object =>
		isStandingCore(object) || (
			object instanceof Ruin &&
			object.structureType === C.STRUCTURE_INVADER_CORE &&
			!expiresNextTick(object['#decayTime'])));
}
