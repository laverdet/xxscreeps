import { bindRenderer } from 'xxscreeps/backend';
import { StructureContainer } from './container';
import { Resource } from './resource';
import { Capacity, Restricted, SingleResource, Store } from './store';

// Store renderer
export function renderStore(store: Store) {
	const result: any = {
		store: { ...store },
		storeCapacity: store.getCapacity(),
	};
	if (store[Restricted]) {
		if (store._capacityByResource) {
			const capacityByResource: any = {};
			for (const [ resourceType, value ] of store._capacityByResource.entries()) {
				capacityByResource[resourceType] = value;
			}
			result.storeCapacityResource = capacityByResource;
		} else {
			result.storeCapacityResource = { [store[SingleResource]!]: store[Capacity] };
		}
	}
	return result;
}

bindRenderer(Resource, (resource, next) => ({
	...next(),
	type: 'energy',
	resourceType: resource.resourceType,
	[resource.resourceType]: resource.amount,
}));

bindRenderer(StructureContainer, (container, next) => ({
	...next(),
	...renderStore(container.store),
	nextDecayTime: container._nextDecayTime,
}));
