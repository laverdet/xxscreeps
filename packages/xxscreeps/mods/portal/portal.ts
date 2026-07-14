import * as C from 'xxscreeps/game/constants/index.js';
import { createRoomObject, optionalExpiryTime } from 'xxscreeps/game/object.js';
import { RoomPosition } from 'xxscreeps/game/position.js';
import { Structure } from 'xxscreeps/mods/classic/structure/structure.js';
import { withOverlay } from 'xxscreeps/schema/index.js';
import { portalShape } from './schema.js';

export interface PortalDestination extends RoomPosition { shard?: undefined }
export interface RemotePortalDestination { shard: string; room: string }
export type Destination = PortalDestination | RemotePortalDestination;

export class StructurePortal extends withOverlay(Structure, portalShape) {
	@enumerable get destination(): Destination {
		if (this['#destShard'] === '') {
			return new RoomPosition(this['#destX'], this['#destY'], this['#destRoom']);
		}
		return { shard: this['#destShard'], room: this['#destRoom'] };
	}

	@enumerable get ticksToDecay(): number | undefined { return optionalExpiryTime(this['#decayTime']); }

	override get structureType() { return C.STRUCTURE_PORTAL; }
	override get '#lookType'() { return C.LOOK_STRUCTURES; }

	override '#checkObstacle'() {
		return false;
	}
}

export function create(pos: RoomPosition, destination: Destination, decayTime = 0) {
	const portal = createRoomObject(new StructurePortal(), pos);
	if (destination.shard === undefined) {
		portal['#destShard'] = '';
		portal['#destRoom'] = destination.roomName;
		portal['#destX'] = destination.x;
		portal['#destY'] = destination.y;
	} else {
		portal['#destShard'] = destination.shard;
		portal['#destRoom'] = destination.room;
		portal['#destX'] = 0;
		portal['#destY'] = 0;
	}
	portal['#decayTime'] = decayTime;
	return portal;
}
