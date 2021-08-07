import type { BufferView } from 'xxscreeps/schema';
import type { ResourceType } from 'xxscreeps/mods/resource/resource';
import * as C from 'xxscreeps/game/constants';
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
		this[C.RESOURCE_ENERGY] = this['#energy'];
		const reaction = this['#mineralType'];
		if (reaction) {
			this[reaction] = this['#mineralAmount'];
		}
	}

	getCapacity(resourceType?: ResourceType) {
		if (resourceType === C.RESOURCE_ENERGY) {
			return C.LAB_ENERGY_CAPACITY;
		} else if (resourceType === undefined) {
			return null;
		} else {
			const mineralType = this['#mineralType'];
			if (mineralType === undefined) {
				return C.LAB_ENERGY_CAPACITY + C.LAB_MINERAL_CAPACITY;
			} else if (mineralType === resourceType) {
				return C.LAB_MINERAL_CAPACITY;
			}
			return null;
		}
	}

	getUsedCapacity(resourceType?: ResourceType) {
		if (resourceType === undefined) {
			return null;
		} else {
			return this[resourceType] ?? null;
		}
	}

	['#add'](type: ResourceType, amount: number) {
		if (type === C.RESOURCE_ENERGY) {
			this['#energy'] =
			this[C.RESOURCE_ENERGY] += amount;
		} else {
			this['#mineralAmount'] =
			this[type] = (this[type] ?? 0) + amount;
			this['#mineralType'] = type;
		}
	}

	['#subtract'](type: ResourceType, amount: number) {
		if (type === C.RESOURCE_ENERGY) {
			this[C.RESOURCE_ENERGY] -= amount;
		} else {
			this['#mineralAmount'] =
			this[type]! -= amount;
			if (this[type] === 0) {
				this['#mineralType'] = undefined;
				delete this[type];
			}
		}
	}
}
