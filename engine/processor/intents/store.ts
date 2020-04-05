import { Amount, Capacity, Resources, ResourceType, Restricted, SingleResource, StorageRecord, Store } from '~/game/store';
import { accumulate, instantiate } from '~/lib/utility';

export function add(store: Store, resourceType: ResourceType, amount: number) {

	// Confirm there's enough capacity
	if (store.getFreeCapacity(resourceType) < amount) {
		return false;
	}

	// Add resource
	const didCreate = !(store[resourceType]! > 0);
	store[resourceType] = (store[resourceType] ?? 0) + amount;
	store[Amount] += amount;

	// Handle resource vector if needed
	const singleResourceType = store[SingleResource];
	if (singleResourceType !== resourceType) {

		if (singleResourceType === undefined) {
			if (didCreate) {
				// Update in place
				for (const resource of store[Resources]) {
					if (resource.type === resourceType) {
						resource.amount += amount;
						break;
					}
				}
			} else {
				// Add new element for this resource
				store[Resources].push({ type: resourceType, amount, capacity: 0 });
			}

		} else if (!(store[singleResourceType]! > 0)) {
			// In this case the single resource flag represents a resource with nothing
			store[SingleResource] = resourceType;

		} else if (didCreate) {
			// Will need to promoted this single resource to a vector
			store[Resources] = [
				{ type: singleResourceType, amount: store[singleResourceType]!, capacity: 0 },
				{ type: resourceType, amount, capacity: 0 },
			];
		}
	}
	return true;
}

export function subtract(store: Store, resourceType: ResourceType, amount: number) {

	// Confirm there's enough resource
	if (!(store[resourceType]! >= amount)) {
		return false;
	}

	// Withdraw resource
	store[resourceType] -= amount;
	store[Amount] -= amount;

	// Handle resource vector if needed
	if (store[SingleResource] !== resourceType) {

		if (store[resourceType] === 0) {
			// Last of the resource.. maybe this can become a single resource store
			if (resourceType !== 'energy') {
				delete store[resourceType];
			}
			const resources = store[Resources].filter(resource => resource.type !== resourceType || resource.capacity);
			if (resources.length <= 1) {
				// Simplify memory layout
				store[SingleResource] = resources.length === 0 ? 'energy' : resources[0].type;
				store[Resources] = [];
			} else {
				// Remains multi-resource store
				store[Resources] = resources;
			}
		} else {
			// Just reduce the stored resource in place
			for (const resource of store[Resources]) {
				if (resource.type === resourceType) {
					resource.amount -= amount;
					break;
				}
			}
		}
	}
	return true;
}

export function create(capacity: number | null, capacityByResource?: StorageRecord, store?: StorageRecord) {
	// Build resource vector
	const resources: { type: string; amount: number; capacity: number }[] = [];
	if (capacityByResource) {
		for (const [ type, capacity ] of Object.entries(capacityByResource)) {
			resources.push({ type, amount: store?.[type as ResourceType] ?? 0, capacity: capacity! });
		}
	}
	if (store) {
		for (const [ type, amount ] of Object.entries(store)) {
			if (capacityByResource?.[type as ResourceType] === undefined) {
				resources.push({ type, amount: amount!, capacity: 0 });
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
		[Amount]: store ? accumulate(Object.values(store), amount => amount!) : 0,
		[Capacity]: calculatedCapacity,
		[Resources]: singleResource === undefined ? resources : [],
		[Restricted]: isRestricted,
		[SingleResource]: singleResource,
	});
}
