import type { RoomPosition } from 'xxscreeps/game/position';
import * as C from 'xxscreeps/game/constants';
import * as Game from 'xxscreeps/game/game';
import * as Store from 'xxscreeps/game/store';
import * as RoomObject from 'xxscreeps/game/objects/room-object';
import * as Structure from '.';
import { compose, declare, struct, variant, withOverlay } from 'xxscreeps/schema';
import { assign } from 'xxscreeps/util/utility';

export function format() { return compose(shape, StructureContainer) }
const shape = declare('Container', struct(Structure.format, {
	...variant('container'),
	store: Store.format,
	_nextDecayTime: 'int32',
}));

export class StructureContainer extends withOverlay(Structure.Structure, shape) {
	get storeCapacity() { return this.store.getCapacity(C.RESOURCE_ENERGY) }
	get structureType() { return C.STRUCTURE_CONTAINER }
	get ticksToDecay() { return Math.max(0, this._nextDecayTime - Game.time) }
}

export function create(pos: RoomPosition) {
	const ownedController = Game.rooms[pos.roomName]!.controller?.owner;
	return assign(RoomObject.create(new StructureContainer, pos), {
		hits: C.EXTENSION_HITS,
		store: Store.create(C.CONTAINER_CAPACITY),
		_nextDecayTime: Game.time + (ownedController ?
			C.CONTAINER_DECAY_TIME_OWNED : C.CONTAINER_DECAY_TIME),
	});
}
