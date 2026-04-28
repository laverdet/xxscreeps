import * as C from 'xxscreeps/game/constants/index.js';
import { Game } from 'xxscreeps/game/index.js';
import * as RoomObject from 'xxscreeps/game/object.js';
import { RoomPosition } from 'xxscreeps/game/position.js';
import { Structure, structureFormat } from 'xxscreeps/mods/structure/structure.js';
import { compose, declare, struct, variant, withOverlay } from 'xxscreeps/schema/index.js';

export interface PortalDestination extends RoomPosition { shard?: undefined }
export interface RemotePortalDestination { shard: string; room: string }
export type Destination = PortalDestination | RemotePortalDestination;

export const format = declare('Portal', () => compose(shape, StructurePortal));
const shape = struct(structureFormat, {
	...variant('portal'),
	'#destShard': 'string',
	'#destRoom': 'string',
	'#destX': 'int8',
	'#destY': 'int8',
	'#decayTime': 'int32',
});

export class StructurePortal extends withOverlay(Structure, shape) {
	@enumerable get destination(): Destination {
		if (this['#destShard'] === '') {
			return new RoomPosition(this['#destX'], this['#destY'], this['#destRoom']);
		}
		return { shard: this['#destShard'], room: this['#destRoom'] };
	}

	@enumerable get ticksToDecay(): number | undefined {
		return this['#decayTime'] === 0 ? undefined : Math.max(0, this['#decayTime'] - Game.time);
	}

	override get structureType() { return C.STRUCTURE_PORTAL; }
	override get '#lookType'() { return C.LOOK_STRUCTURES; }

	override '#checkObstacle'() {
		return false;
	}
}

export function create(pos: RoomPosition, destination: Destination, decayTime = 0) {
	const portal = RoomObject.create(new StructurePortal(), pos);
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
