import * as C from '~/game/constants';
import { Variant } from '~/lib/schema';
import * as Store from '~/game/store';
import { Structure } from '.';

export class StructureExtension extends Structure {
	get [Variant]() { return 'extension' }
	get energy() { return this.store[C.RESOURCE_ENERGY] }
	get energyCapacity() { return this.store.getCapacity(C.RESOURCE_ENERGY) }
	get structureType() { return C.STRUCTURE_EXTENSION }

	store!: Store.Store;
}
