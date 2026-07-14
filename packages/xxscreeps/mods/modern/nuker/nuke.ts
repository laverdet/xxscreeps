import type { RoomPosition } from 'xxscreeps/game/position.js';
import * as C from 'xxscreeps/game/constants/index.js';
import { RoomObject, createRoomObject, requiredExpiryTime } from 'xxscreeps/game/object.js';
import { withOverlay } from 'xxscreeps/schema/index.js';
import { nukeShape } from './schema.js';

/**
 * A nuke landing in this room. Created by `StructureNuker.launchNuke`. Visible to
 * the target room's owner; lands `NUKE_LAND_TIME` ticks after launch.
 */
export class Nuke extends withOverlay(RoomObject, nukeShape) {
	@enumerable get launchRoomName() { return this['#launchRoomName']; }
	@enumerable get timeToLand() { return requiredExpiryTime(this['#landTime'] + 1) - 1; }

	override get '#lookType'() { return C.LOOK_NUKES; }
}

export function create(pos: RoomPosition, launchRoomName: string, landTime: number) {
	const nuke = createRoomObject(new Nuke(), pos);
	nuke['#landTime'] = landTime;
	nuke['#launchRoomName'] = launchRoomName;
	return nuke;
}
