import * as C from '~/game/constants';
import type { shape } from '~/engine/schema/extension';
import { withOverlay } from '~/lib/schema';
import { Structure } from '.';

export class StructureExtension extends withOverlay<typeof shape>()(Structure) {
	get energy() { return this.store[C.RESOURCE_ENERGY] }
	get energyCapacity() { return this.store.getCapacity(C.RESOURCE_ENERGY) }
	get structureType() { return C.STRUCTURE_EXTENSION }
}
