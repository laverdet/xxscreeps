import type { Store } from './store';
import { bindRenderer } from 'xxscreeps/backend';
import { StructureContainer } from './container';
import { Resource } from './resource';

// Store renderer
export function renderStore(store: Store) {
	const result: any = {
		store: { ...store },
		storeCapacity: store.getCapacity(),
	};
	if (store['#restricted']) {
		if (store['#capacityByResource']) {
			const capacityByResource: any = {};
			for (const [ resourceType, value ] of store['#capacityByResource'].entries()) {
				capacityByResource[resourceType] = value;
			}
			result.storeCapacityResource = capacityByResource;
		} else {
			result.storeCapacityResource = { [store['#singleResource']!]: store['#capacity'] };
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
	nextDecayTime: container['#nextDecayTime'],
}));
