import type { ResourceType } from 'xxscreeps/mods/classic/resource/resource.js';
import type { BufferView } from 'xxscreeps/schema/index.js';
import * as C from 'xxscreeps/game/constants/index.js';
import { Store } from 'xxscreeps/mods/classic/resource/store.js';
import { compose, struct, withOverlay } from 'xxscreeps/schema/index.js';

const shape = struct({
	'#energy': 'int32',
	'#ghodium': 'int32',
});
export const nukerStoreFormat = () => compose(shape, NukerStore);

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

	override '#doesAllowWithdraw'() { return false; }

	'#storeCapacityResource'() {
		return {
			[C.RESOURCE_ENERGY]: C.NUKER_ENERGY_CAPACITY,
			[C.RESOURCE_GHODIUM]: C.NUKER_GHODIUM_CAPACITY,
		};
	}

	getCapacity(resourceType: typeof C.RESOURCE_ENERGY | typeof C.RESOURCE_GHODIUM): number;
	getCapacity(resourceType?: ResourceType): null;
	getCapacity(resourceType?: ResourceType): number | null {
		// eslint-disable-next-line @typescript-eslint/switch-exhaustiveness-check
		switch (resourceType) {
			case C.RESOURCE_ENERGY: return C.NUKER_ENERGY_CAPACITY;
			case C.RESOURCE_GHODIUM: return C.NUKER_GHODIUM_CAPACITY;
			default: return null;
		}
	}

	getUsedCapacity(resourceType: typeof C.RESOURCE_ENERGY | typeof C.RESOURCE_GHODIUM): number;
	getUsedCapacity(resourceType?: ResourceType): null;
	getUsedCapacity(resourceType?: ResourceType): number | null {
		// eslint-disable-next-line @typescript-eslint/switch-exhaustiveness-check
		switch (resourceType) {
			case C.RESOURCE_ENERGY: return this['#energy'];
			case C.RESOURCE_GHODIUM: return this['#ghodium'];
			default: return null;
		}
	}

	'#add'(type: ResourceType, amount: number) {
		// eslint-disable-next-line @typescript-eslint/switch-exhaustiveness-check
		switch (type) {
			case C.RESOURCE_ENERGY: this['#energy'] = this[C.RESOURCE_ENERGY] += amount; break;
			case C.RESOURCE_GHODIUM: this['#ghodium'] = this[C.RESOURCE_GHODIUM] += amount; break;
		}
	}

	'#subtract'(type: ResourceType, amount: number) {
		// eslint-disable-next-line @typescript-eslint/switch-exhaustiveness-check
		switch (type) {
			case C.RESOURCE_ENERGY: this['#energy'] = this[C.RESOURCE_ENERGY] -= amount; break;
			case C.RESOURCE_GHODIUM: this['#ghodium'] = this[C.RESOURCE_GHODIUM] -= amount; break;
		}
	}
}
