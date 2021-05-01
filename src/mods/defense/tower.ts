import type { RoomPosition } from 'xxscreeps/game/position';
import * as C from 'xxscreeps/game/constants';
import * as RoomObject from 'xxscreeps/game/object';
import * as Structure from '../structure/structure';
import * as Store from 'xxscreeps/mods/resource/store';
import { compose, declare, struct, variant, withOverlay } from 'xxscreeps/schema';
import { assign } from 'xxscreeps/utility/utility';

export const format = () => compose(shape, StructureTower);
const shape = declare('Tower', struct(Structure.format, {
	...variant('tower'),
	store: Store.restrictedFormat<'energy'>(),
}));

export class StructureTower extends withOverlay(Structure.Structure, shape) {
	get energy() { return this.store[C.RESOURCE_ENERGY] }
	get energyCapacity() { return this.store.getCapacity(C.RESOURCE_ENERGY) }
	get structureType() { return C.STRUCTURE_TOWER }
}

export function create(pos: RoomPosition, owner: string) {
	return assign(RoomObject.create(new StructureTower, pos), {
		hits: C.TOWER_HITS,
		store: Store.create(null, { energy: C.TOWER_CAPACITY }),
		[RoomObject.Owner]: owner,
	});
}
