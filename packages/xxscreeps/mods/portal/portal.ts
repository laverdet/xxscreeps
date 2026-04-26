import * as C from 'xxscreeps/game/constants/index.js';
import { Game } from 'xxscreeps/game/index.js';
import * as RoomObject from 'xxscreeps/game/object.js';
import { RoomPosition } from 'xxscreeps/game/position.js';
import { Structure, structureFormat } from 'xxscreeps/mods/structure/structure.js';
import { compose, declare, struct, variant, withOverlay } from 'xxscreeps/schema/index.js';

export type SameShardDestination = { shard?: undefined; room: string; x: number; y: number };
export type CrossShardDestination = { shard: string; room: string };
export type Destination = SameShardDestination | CrossShardDestination;

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
	override get structureType() { return C.STRUCTURE_PORTAL; }
	override get '#lookType'() { return C.LOOK_STRUCTURES; }

	@enumerable get destination(): RoomPosition | { shard: string; room: string } {
		if (this['#destShard'] !== '') {
			return { shard: this['#destShard'], room: this['#destRoom'] };
		}
		return new RoomPosition(this['#destX'], this['#destY'], this['#destRoom']);
	}

	@enumerable get ticksToDecay(): number | undefined {
		const decayTime = this['#decayTime'];
		if (decayTime === 0) return undefined;
		return Math.max(0, decayTime - Game.time);
	}

	override '#checkObstacle'() {
		return false;
	}
}

export function create(pos: RoomPosition, destination: Destination, decayTime = 0) {
	const portal = RoomObject.create(new StructurePortal(), pos);
	if (destination.shard !== undefined) {
		portal['#destShard'] = destination.shard;
		portal['#destRoom'] = destination.room;
		portal['#destX'] = 0;
		portal['#destY'] = 0;
	} else {
		portal['#destShard'] = '';
		portal['#destRoom'] = destination.room;
		portal['#destX'] = destination.x;
		portal['#destY'] = destination.y;
	}
	portal['#decayTime'] = decayTime;
	return portal;
}
