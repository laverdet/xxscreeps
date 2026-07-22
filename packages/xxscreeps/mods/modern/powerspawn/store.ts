import type { ResourceType } from 'xxscreeps/mods/classic/resource/resource.js';
import type { BufferView } from 'xxscreeps/schema/index.js';
import { Store } from 'xxscreeps/mods/classic/resource/store.js';
import { compose, struct, withOverlay } from 'xxscreeps/schema/index.js';
import * as C from 'xxscreeps:mods/constants';

const shape = struct({
	'#energy': 'int32',
	'#power': 'int32',
});
export const powerSpawnStoreFormat = () => compose(shape, PowerSpawnStore);

export class PowerSpawnStore extends withOverlay(Store, shape) {
	constructor(view?: BufferView, offset?: number) {
		super(view, offset);
		const energy = this['#energy'];
		if (energy > 0) {
			this[C.RESOURCE_ENERGY] = energy;
		}
		const power = this['#power'];
		if (power > 0) {
			this[C.RESOURCE_POWER] = power;
		}
	}

	'#storeCapacityResource'() {
		return {
			[C.RESOURCE_ENERGY]: C.POWER_SPAWN_ENERGY_CAPACITY,
			[C.RESOURCE_POWER]: C.POWER_SPAWN_POWER_CAPACITY,
		};
	}

	getCapacity(resourceType: typeof C.RESOURCE_ENERGY | typeof C.RESOURCE_POWER): number;
	getCapacity(resourceType?: ResourceType): null;
	getCapacity(resourceType?: ResourceType): number | null {
		// eslint-disable-next-line @typescript-eslint/switch-exhaustiveness-check
		switch (resourceType) {
			case C.RESOURCE_ENERGY: return C.POWER_SPAWN_ENERGY_CAPACITY;
			case C.RESOURCE_POWER: return C.POWER_SPAWN_POWER_CAPACITY;
			default: return null;
		}
	}

	getUsedCapacity(resourceType: typeof C.RESOURCE_ENERGY | typeof C.RESOURCE_POWER): number;
	getUsedCapacity(resourceType?: ResourceType): null;
	getUsedCapacity(resourceType?: ResourceType): number | null {
		// eslint-disable-next-line @typescript-eslint/switch-exhaustiveness-check
		switch (resourceType) {
			case C.RESOURCE_ENERGY: return this['#energy'];
			case C.RESOURCE_POWER: return this['#power'];
			default: return null;
		}
	}

	'#add'(type: ResourceType, amount: number) {
		// eslint-disable-next-line @typescript-eslint/switch-exhaustiveness-check
		switch (type) {
			case C.RESOURCE_ENERGY: this['#energy'] = this[C.RESOURCE_ENERGY] += amount; break;
			case C.RESOURCE_POWER: this['#power'] = this[C.RESOURCE_POWER] += amount; break;
		}
	}

	'#subtract'(type: ResourceType, amount: number) {
		// eslint-disable-next-line @typescript-eslint/switch-exhaustiveness-check
		switch (type) {
			case C.RESOURCE_ENERGY: this['#energy'] = this[C.RESOURCE_ENERGY] -= amount; break;
			case C.RESOURCE_POWER: this['#power'] = this[C.RESOURCE_POWER] -= amount; break;
		}
	}
}
