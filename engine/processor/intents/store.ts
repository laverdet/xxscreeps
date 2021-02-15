import { ResourceType, StorageRecord, Store } from 'xxscreeps/game/store';
import { accumulate, instantiate } from 'xxscreeps/util/utility';

export function add(store: Store, resourceType: ResourceType, amount: number) {

	// Confirm there's enough capacity
	if (store.getFreeCapacity(resourceType) < amount) {
		throw new Error('Store does not have enough capacity');
	}

	// Add resource
	const didCreate = !(store[resourceType]! > 0);
	store[resourceType] = (store[resourceType] ?? 0) + amount;
	store._amount += amount;

	// Handle resource vector if needed
	const singleResourceType = store._singleResource;
	if (singleResourceType !== resourceType) {

		if (singleResourceType === undefined) {
			if (didCreate) {
				// Update in place
				for (const resource of store._resources) {
					if (resource.type === resourceType) {
						resource.amount += amount;
						break;
					}
				}
			} else {
				// Add new element for this resource
				store._resources.push({ type: resourceType, amount, capacity: 0 });
			}

		} else if (!(store[singleResourceType]! > 0)) {
			// In this case the single resource flag represents a resource with nothing
			store._singleResource = resourceType;

		} else if (didCreate) {
			// Will need to promoted this single resource to a vector
			store._resources = [
				{ type: singleResourceType, amount: store[singleResourceType]!, capacity: 0 },
				{ type: resourceType, amount, capacity: 0 },
			];
		}
	}
}

export function subtract(store: Store, resourceType: ResourceType, amount: number) {

	// Confirm there's enough resource
	if (!(store[resourceType]! >= amount)) {
		throw new Error('Store does not have enough resource');
	}

	// Withdraw resource
	store[resourceType] -= amount;
	store._amount -= amount;

	// Handle resource vector if needed
	if (store._singleResource !== resourceType) {

		if (store[resourceType] === 0) {
			// Last of the resource.. maybe this can become a single resource store
			if (resourceType !== 'energy') {
				delete store[resourceType];
			}
			const resources = store._resources.filter(resource => resource.type !== resourceType || resource.capacity);
			if (resources.length <= 1) {
				// Simplify memory layout
				store._singleResource = resources.length === 0 ? 'energy' : resources[0].type;
				store._resources = [];
			} else {
				// Remains multi-resource store
				store._resources = resources;
			}
		} else {
			// Just reduce the stored resource in place
			for (const resource of store._resources) {
				if (resource.type === resourceType) {
					resource.amount -= amount;
					break;
				}
			}
		}
	}
}

export function create(capacity: number | null, capacityByResource?: StorageRecord, store?: StorageRecord) {
	// Build resource vector
	const resources: { type: ResourceType; amount: number; capacity: number }[] = [];
	if (capacityByResource) {
		for (const [ type, capacity ] of Object.entries(capacityByResource) as [ ResourceType, number ][]) {
			resources.push({ type, amount: store?.[type] ?? 0, capacity });
		}
	}
	if (store) {
		for (const [ type, amount ] of Object.entries(store) as [ ResourceType, number ][]) {
			if (capacityByResource?.[type] === undefined) {
				resources.push({ type, amount, capacity: 0 });
			}
		}
	}

	// Is single resource?
	const singleResource =
		resources.length === 0 ? 'energy' :
		resources.length === 1 ? resources[0].type :
		undefined;

	// Is restricted?
	const isRestricted = resources.some(resource => resource.capacity !== 0);

	// Calculate capacity
	const calculatedCapacity = function() {
		if (capacity === null) {
			if (isRestricted) {
				return resources.reduce((capacity, info) => info.capacity + capacity, 0);
			} else {
				throw new Error('`Store` missing capacity');
			}
		} else {
			return capacity;
		}
	}();

	// Return data to save
	return instantiate(Store, {
		...store,
		_amount: store ? accumulate(Object.values(store), amount => amount!) : 0,
		_capacity: calculatedCapacity,
		_resources: singleResource === undefined ? resources : [],
		_restricted: isRestricted,
		_singleResource: singleResource,
	});
}
