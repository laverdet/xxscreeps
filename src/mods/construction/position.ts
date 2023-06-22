import type { ConstructibleStructureType } from './construction-site.js';
import type { Room } from 'xxscreeps/game/room/index.js';
import { RoomPosition, fetchRoom } from 'xxscreeps/game/position.js';
import { extend } from 'xxscreeps/utility/utility.js';

declare module 'xxscreeps/game/position' {
	interface RoomPosition {
		/**
		 * Create new `ConstructionSite` at the specified location.
		 * @param structureType One of the `STRUCTURE_*` constants.
		 * @param name The name of the structure, for structures that support it (currently only spawns).
		 */
		createConstructionSite(structureType: ConstructibleStructureType, name?: string): ReturnType<Room['createConstructionSite']>;
	}
}

extend(RoomPosition, {
	createConstructionSite(structureType: ConstructibleStructureType, name?: string) {
		return fetchRoom(this.roomName).createConstructionSite(this, structureType, name);
	},
});
