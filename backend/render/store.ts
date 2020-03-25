import { Store, CapacityByResource } from '~/engine/game/store';

export function render(this: Store) {
	const result: any = {
		store: { ...this },
		storeCapacity: this.getCapacity(),
	};
	if (this[CapacityByResource]) {
		const capacityByResource: any = {};
		for (const [ resourceType, value ] of this[CapacityByResource]!.entries()) {
			capacityByResource[resourceType] = value;
		}
		result.storeCapacityResource = capacityByResource;
	}
	return result;
}
