import type { Store } from './store.js';
import { bindRenderer } from 'xxscreeps/backend/index.js';
import { Fn } from 'xxscreeps/functional/fn.js';
import { StructureContainer } from './container.js';
import { Resource } from './resource.js';

interface RenderedStore {
	store: Record<string, unknown>;
	storeCapacity?: unknown;
	storeCapacityResource?: Record<string, unknown>;
}

// Store renderer
export function renderStore(store: Store) {
	const result: RenderedStore = {
		store: Fn.fromEntries(store['#entries']()),
	};
	const storeCapacityResource = store['#storeCapacityResource']();
	if (storeCapacityResource === null) {
		result.storeCapacity = store.getCapacity();
	} else {
		result.storeCapacityResource = storeCapacityResource;
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
