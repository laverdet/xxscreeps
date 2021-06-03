import type { Store } from './store';
import * as Fn from 'xxscreeps/utility/functional';
import { bindRenderer } from 'xxscreeps/backend';
import { StructureContainer } from './container';
import { Resource } from './resource';

// Store renderer
export function renderStore(store: Store) {
	const result: any = {
		store: Fn.fromEntries(store['#entries']()),
	};
	if (store['#restricted']) {
		const singleResource = store['#singleResource'];
		result.storeCapacityResource = function() {
			if (singleResource) {
				return { [singleResource]: store['#capacity'] };
			} else {
				return Fn.fromEntries(store['#capacityByResource']!.entries());
			}
		}();
	} else {
		result.storeCapacity = store.getCapacity();
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
