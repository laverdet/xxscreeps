import type { RoomPosition } from 'xxscreeps/game/position.js';
import * as C from 'xxscreeps/game/constants/index.js';
import { RoomObject, createRoomObject, requiredExpiryTime } from 'xxscreeps/game/object.js';
import { withOverlay } from 'xxscreeps/schema/index.js';
import { nukeShape } from './schema.js';

/**
 * A nuke landing position. This object cannot be removed or modified. You can find incoming nukes
 * in the room using the `FIND_NUKES` constant.
 * @public
 * @see https://docs.screeps.com/api/#Nuke
 */
export class Nuke extends withOverlay(RoomObject, nukeShape) {
	/**
	 * The name of the room where this nuke has been launched from.
	 * @public
	 * @see https://docs.screeps.com/api/#Nuke.launchRoomName
	 */
	@enumerable get launchRoomName() { return this['#launchRoomName']; }

	/**
	 * The remaining landing time.
	 * @public
	 * @see https://docs.screeps.com/api/#Nuke.timeToLand
	 */
	@enumerable get timeToLand() { return requiredExpiryTime(this['#landTime'] + 1) - 1; }

	override get '#lookType'() { return C.LOOK_NUKES; }
}

export function create(pos: RoomPosition, launchRoomName: string, landTime: number) {
	const nuke = createRoomObject(new Nuke(), pos);
	nuke['#landTime'] = landTime;
	nuke['#launchRoomName'] = launchRoomName;
	return nuke;
}
