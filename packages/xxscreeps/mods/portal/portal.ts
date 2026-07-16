import * as C from 'xxscreeps/game/constants/index.js';
import { createRoomObject, optionalExpiryTime } from 'xxscreeps/game/object.js';
import { RoomPosition } from 'xxscreeps/game/position.js';
import { Structure } from 'xxscreeps/mods/classic/structure/structure.js';
import { withOverlay } from 'xxscreeps/schema/index.js';
import { portalShape } from './schema.js';

/**
 * Destination of an inter-room portal: a `RoomPosition` in the destination room.
 * @public
 */
export interface PortalDestination extends RoomPosition { shard?: undefined }

/**
 * Destination of an inter-shard portal: `shard` and `room` names, without exact coordinates.
 * @public
 */
export interface RemotePortalDestination { shard: string; room: string }

export type Destination = PortalDestination | RemotePortalDestination;

/**
 * A non-player structure. Instantly teleports your creeps to a distant room acting as a room exit
 * tile. Portals appear randomly in the central room of each sector.
 * @public
 * @see https://docs.screeps.com/api/#StructurePortal
 */
export class StructurePortal extends withOverlay(Structure, portalShape) {
	/**
	 * If this is an **inter-room** portal, then this property contains a `RoomPosition` object
	 * leading to the point in the destination room.
	 *
	 * If this is an **inter-shard** portal, then this property contains an object with `shard` and
	 * `room` string properties. Exact coordinates are undetermined, the creep will appear at any free
	 * spot in the destination room.
	 * @public
	 * @see https://docs.screeps.com/api/#StructurePortal.destination
	 */
	@enumerable get destination(): Destination {
		if (this['#destShard'] === '') {
			return new RoomPosition(this['#destX'], this['#destY'], this['#destRoom']);
		}
		return { shard: this['#destShard'], room: this['#destRoom'] };
	}

	/**
	 * The amount of game ticks when the portal disappears, or undefined when the portal is stable.
	 * @public
	 * @see https://docs.screeps.com/api/#StructurePortal.ticksToDecay
	 */
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
