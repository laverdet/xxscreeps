import type { RoomPosition } from 'xxscreeps/game/position.js';
import * as C from 'xxscreeps/game/constants/index.js';
import { Game } from 'xxscreeps/game/index.js';
import { RoomObject, cooldownTime, create as createObject, format as objectFormat } from 'xxscreeps/game/object.js';
import { compose, declare, struct, variant, withOverlay } from 'xxscreeps/schema/index.js';

export const format = declare('Nuke', () => compose(shape, Nuke));
const shape = struct(objectFormat, {
	...variant('nuke'),
	'#landTime': 'int32',
	'#launchRoomName': 'string',
});

/**
 * A nuke landing in this room. Created by `StructureNuker.launchNuke`. Visible to
 * the target room's owner; lands `NUKE_LAND_TIME` ticks after launch.
 */
export class Nuke extends withOverlay(RoomObject, shape) {
	@enumerable get launchRoomName() { return this['#launchRoomName']; }
	// `cooldownTime` clamps at 0; `optionalExpiryTime` throws on overdue, which would
	// fire on the post-impact tick while the nuke is still visible with timeToLand=0.
	@enumerable get timeToLand() { return cooldownTime(Game, this['#landTime']); }

	override get '#lookType'() { return C.LOOK_NUKES; }
}

export function create(pos: RoomPosition, launchRoomName: string, landTime: number) {
	const nuke = createObject(new Nuke(), pos);
	nuke['#landTime'] = landTime;
	nuke['#launchRoomName'] = launchRoomName;
	return nuke;
}
