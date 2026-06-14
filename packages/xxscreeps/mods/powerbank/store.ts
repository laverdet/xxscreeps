import type { ResourceType } from 'xxscreeps/mods/resource/resource.js';
import type { BufferView } from 'xxscreeps/schema/index.js';
import * as C from 'xxscreeps/game/constants/index.js';
import { Store } from 'xxscreeps/mods/resource/store.js';
import { compose, struct, withOverlay } from 'xxscreeps/schema/index.js';

const shape = struct({
	'#power': 'int32',
});
export const powerBankStoreFormat = () => compose(shape, PowerBankStore);

export class PowerBankStore extends withOverlay(Store, shape) {
	constructor(view?: BufferView, offset?: number) {
		super(view, offset);
		const power = this['#power'];
		if (power > 0) {
			this[C.RESOURCE_POWER] = power;
		}
	}

	static '#create'(power: number) {
		const instance = new PowerBankStore();
		instance['#add'](C.RESOURCE_POWER, power);
		return instance;
	}

	override '#doesAllowWithdraw'() { return false; }

	'#storeCapacityResource'() { return null; }

	getCapacity(_resourceType?: ResourceType) { return null; }

	getUsedCapacity(resourceType: typeof C.RESOURCE_POWER): number;
	getUsedCapacity(resourceType?: ResourceType): null;
	getUsedCapacity(resourceType?: ResourceType) {
		return resourceType === C.RESOURCE_POWER ? this['#power'] : null;
	}

	'#add'(type: ResourceType, amount: number) {
		if (type === C.RESOURCE_POWER) {
			this['#power'] = this[C.RESOURCE_POWER] += amount;
		}
	}

	'#subtract'(type: ResourceType, amount: number) {
		if (type === C.RESOURCE_POWER) {
			this['#power'] = this[C.RESOURCE_POWER] -= amount;
		}
	}
}
