import type { BufferView } from 'xxscreeps/schema';
import type { ResourceType } from 'xxscreeps/mods/resource/resource';
import C from 'xxscreeps/game/constants';
import { Store } from 'xxscreeps/mods/resource/store';
import { optionalResourceEnumFormat } from 'xxscreeps/mods/resource/resource';
import { compose, struct, withOverlay } from 'xxscreeps/schema';

const shape = struct({
	'#energy': 'int32',
	'#mineralAmount': 'int32',
	'#mineralType': optionalResourceEnumFormat,
});
export const labStoreFormat = () => compose(shape, LabStore);

export class LabStore extends withOverlay(Store, shape) {
	constructor(view?: BufferView, offset?: number) {
		super(view, offset);
		const energy = this['#energy'];
		if (energy) {
			this[C.RESOURCE_ENERGY] = energy;
		}
		const reaction = this['#mineralType'];
		if (reaction) {
			const amount = this['#mineralAmount'];
			if (amount) {
				this[reaction] = amount;
			}
		}
	}

	getCapacity(resourceType?: ResourceType) {
		if (resourceType) {
			if (resourceType === C.RESOURCE_ENERGY) {
				return C.LAB_ENERGY_CAPACITY;
			} else {
				const mineralType = this['#mineralType'];
				if (mineralType === undefined || mineralType === resourceType) {
					return C.LAB_MINERAL_CAPACITY;
				}
			}
		}
		return null;
	}

	getUsedCapacity(resourceType?: ResourceType) {
		if (resourceType) {
			if (resourceType === C.RESOURCE_ENERGY) {
				return this[C.RESOURCE_ENERGY];
			} else {
				const mineralType = this['#mineralType'];
				if (mineralType === undefined || resourceType === mineralType) {
					return this[resourceType];
				}
			}
		}
		return null;
	}

	['#add'](type: ResourceType, amount: number) {
		if (type === C.RESOURCE_ENERGY) {
			this['#energy'] =
			this[C.RESOURCE_ENERGY] += amount;
		} else {
			this['#mineralAmount'] =
			this[type] += amount;
			this['#mineralType'] = type;
		}
	}

	['#subtract'](type: ResourceType, amount: number) {
		if (type === C.RESOURCE_ENERGY) {
			this['#energy'] =
			this[C.RESOURCE_ENERGY] -= amount;
			if (this[C.RESOURCE_ENERGY] === 0) {
				delete this[C.RESOURCE_ENERGY as ResourceType];
			}
		} else {
			this['#mineralAmount'] =
			this[type] -= amount;
			if (this[type] === 0) {
				this['#mineralType'] = undefined;
				delete this[type];
			}
		}
	}
}
