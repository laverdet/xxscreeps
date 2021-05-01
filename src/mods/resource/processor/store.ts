import type { ResourceType, Store } from '../store';
import { Amount, Resources, SingleResource } from '../store';

export function add(store: Store, resourceType: ResourceType, amount: number) {

	// Confirm there's enough capacity
	if (store.getFreeCapacity(resourceType) < amount) {
		throw new Error('Store does not have enough capacity');
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
}

export function subtract(store: Store, resourceType: ResourceType, amount: number) {

	// Confirm there's enough resource
	if (!(store[resourceType]! >= amount)) {
		throw new Error('Store does not have enough resource');
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
}
