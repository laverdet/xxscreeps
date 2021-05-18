import type { RoomPosition } from 'xxscreeps/game/position';
import * as C from 'xxscreeps/game/constants';
import * as RoomObject from 'xxscreeps/game/object';
import * as Store from './store';
import { Game } from 'xxscreeps/game';
import { Structure, checkWall, structureFormat } from 'xxscreeps/mods/structure/structure';
import { registerBuildableStructure } from 'xxscreeps/mods/construction';
import { compose, declare, struct, variant, withOverlay } from 'xxscreeps/schema';
import { assign } from 'xxscreeps/utility/utility';

export const format = () => compose(shape, StructureContainer);
const shape = declare('Container', struct(structureFormat, {
	...variant('container'),
	hits: 'int32',
	store: Store.format,
	'#nextDecayTime': 'int32',
}));

export class StructureContainer extends withOverlay(Structure, shape) {
	get hitsMax() { return C.CONTAINER_HITS }
	get storeCapacity() { return this.store.getCapacity(C.RESOURCE_ENERGY) }
	get structureType() { return C.STRUCTURE_CONTAINER }
	get ticksToDecay() { return Math.max(0, this['#nextDecayTime'] - Game.time) }

	['#checkObstacle']() {
		return false;
	}
}

export function create(pos: RoomPosition) {
	const ownedController = Game.rooms[pos.roomName]!.controller?.owner;
	return assign(RoomObject.create(new StructureContainer, pos), {
		hits: C.EXTENSION_HITS,
		store: Store.create(C.CONTAINER_CAPACITY),
		'#nextDecayTime': Game.time + (ownedController ?
			C.CONTAINER_DECAY_TIME_OWNED : C.CONTAINER_DECAY_TIME),
	});
}

registerBuildableStructure(C.STRUCTURE_CONTAINER, {
	obstacle: false,
	checkPlacement(room, pos) {
		return checkWall(pos) === C.OK ?
			C.CONSTRUCTION_COST.container : null;
	},
	create(site) {
		return create(site.pos);
	},
});
