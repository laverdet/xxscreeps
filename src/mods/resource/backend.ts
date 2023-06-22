import type { Store } from './store.js';
import Fn from 'xxscreeps/utility/functional.js';
import { bindRenderer } from 'xxscreeps/backend/index.js';
import { StructureContainer } from './container.js';
import { Resource } from './resource.js';

// Store renderer
export function renderStore(store: Store) {
	const result: any = {
		store: Fn.fromEntries(store['#entries']()),
	};
	const capacity = store.getCapacity();
	if (capacity === null) {
		result.storeCapacityResource = Fn.fromEntries(
			store['#entries'](),
			([ type ]) => [ type, store.getCapacity(type) ]);
	} else {
		result.storeCapacity = capacity;
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
