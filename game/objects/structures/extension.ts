import * as C from 'xxscreeps/game/constants';
import { compose, declare, struct, variant, withOverlay } from 'xxscreeps/schema';
import * as Structure from '.';
import * as Store from 'xxscreeps/game/store';

export function format() { return compose(shape, StructureExtension) }
const shape = declare('Extension', struct(Structure.format, {
	...variant('extension'),
	store: Store.restrictedFormat<'energy'>(),
}));

export class StructureExtension extends withOverlay(shape)(Structure.Structure) {
	get energy() { return this.store[C.RESOURCE_ENERGY] }
	get energyCapacity() { return this.store.getCapacity(C.RESOURCE_ENERGY) }
	get structureType() { return C.STRUCTURE_EXTENSION }
}
