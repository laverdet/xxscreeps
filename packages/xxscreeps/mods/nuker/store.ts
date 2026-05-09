import type { ResourceType } from 'xxscreeps/mods/resource/resource.js';
import type { BufferView } from 'xxscreeps/schema/index.js';
import * as C from 'xxscreeps/game/constants/index.js';
import { Store } from 'xxscreeps/mods/resource/store.js';
import { compose, struct, withOverlay } from 'xxscreeps/schema/index.js';

const shape = struct({
	'#energy': 'int32',
	'#ghodium': 'int32',
});
export const nukerStoreFormat = () => compose(shape, NukerStore);

function deleteResource(store: Partial<Record<ResourceType, number>>, type: ResourceType) {
	delete store[type];
}

export class NukerStore extends withOverlay(Store, shape) {
	constructor(view?: BufferView, offset?: number) {
		super(view, offset);
		const energy = this['#energy'];
		if (energy > 0) {
			this[C.RESOURCE_ENERGY] = energy;
		}
		const ghodium = this['#ghodium'];
		if (ghodium > 0) {
			this[C.RESOURCE_GHODIUM] = ghodium;
		}
	}

	'#storeCapacityResource'() {
		const result: Record<string, number> = Object.create(null);
		result[C.RESOURCE_ENERGY] = C.NUKER_ENERGY_CAPACITY;
		result[C.RESOURCE_GHODIUM] = C.NUKER_GHODIUM_CAPACITY;
		return result;
	}

	getCapacity(resourceType?: ResourceType) {
		if (resourceType === C.RESOURCE_ENERGY) return C.NUKER_ENERGY_CAPACITY;
		if (resourceType === C.RESOURCE_GHODIUM) return C.NUKER_GHODIUM_CAPACITY;
		return null;
	}

	getUsedCapacity(resourceType?: ResourceType) {
		if (resourceType === C.RESOURCE_ENERGY) return this['#energy'];
		if (resourceType === C.RESOURCE_GHODIUM) return this['#ghodium'];
		return null;
	}

	'#add'(type: ResourceType, amount: number) {
		if (type === C.RESOURCE_ENERGY) {
			this['#energy'] =
				this[C.RESOURCE_ENERGY] += amount;
		} else if (type === C.RESOURCE_GHODIUM) {
			this['#ghodium'] =
				this[C.RESOURCE_GHODIUM] += amount;
		}
	}

	'#subtract'(type: ResourceType, amount: number) {
		if (type === C.RESOURCE_ENERGY) {
			this['#energy'] =
				this[C.RESOURCE_ENERGY] -= amount;
			if (this[C.RESOURCE_ENERGY] === 0) {
				deleteResource(this, C.RESOURCE_ENERGY);
			}
		} else if (type === C.RESOURCE_GHODIUM) {
			this['#ghodium'] =
				this[C.RESOURCE_GHODIUM] -= amount;
			if (this[C.RESOURCE_GHODIUM] === 0) {
				deleteResource(this, C.RESOURCE_GHODIUM);
			}
		}
	}
}
