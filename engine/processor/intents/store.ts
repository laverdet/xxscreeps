import { Amount, Capacity, Resources, ResourceType, Restricted, SingleResource, StorageRecord, Store } from '~/engine/game/store';
import { instantiate } from '~/lib/utility';

export function add(this: Store, resourceType: ResourceType, amount: number) {

	// Confirm there's enough capacity
	if (this.getFreeCapacity(resourceType) < amount) {
		return false;
	}

	// Add resource
	const didCreate = !(this[resourceType]! > 0);
	this[resourceType] = (this[resourceType] ?? 0) + amount;
	this[Amount] += amount;

	// Handle resource vector if needed
	const singleResourceType = this[SingleResource];
	if (singleResourceType !== resourceType) {

		if (singleResourceType === undefined) {
			if (didCreate) {
				// Update in place
				for (const resource of this[Resources]) {
					if (resource.type === resourceType) {
						resource.amount += amount;
						break;
					}
				}
			} else {
				// Add new element for this resource
				this[Resources].push({ type: resourceType, amount, capacity: 0 });
			}

		} else if (!(this[singleResourceType]! > 0)) {
			// In this case the single resource flag represents a resource with nothing
			this[SingleResource] = resourceType;

		} else if (didCreate) {
			// Will need to promoted this single resource to a vector
			this[Resources] = [
				{ type: singleResourceType, amount: this[singleResourceType]!, capacity: 0 },
				{ type: resourceType, amount, capacity: 0 },
			];
		}
	}
	return true;
}

export function subtract(this: Store, resourceType: ResourceType, amount: number) {

	// Confirm there's enough resource
	if (!(this[resourceType]! >= amount)) {
		return false;
	}

	// Withdraw resource
	this[resourceType] -= amount;
	this[Amount] -= amount;

	// Handle resource vector if needed
	if (this[SingleResource] !== resourceType) {

		if (this[resourceType] === 0) {
			// Last of the resource.. maybe this can become a single resource store
			if (resourceType !== 'energy') {
				delete this[resourceType];
			}
			const store = this[Resources].filter(resource => resource.type !== resourceType || resource.capacity);
			if (store.length <= 1) {
				// Simplify memory layout
				this[SingleResource] = store.length === 0 ? 'energy' : store[0].type;
				this[Resources] = [];
			} else {
				// Remains multi-resource store
				this[Resources] = store;
			}
		} else {
			// Just reduce the stored resource in place
			for (const resource of this[Resources]) {
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
			resources.push({ type, amount: store?.[type as ResourceType] ?? 0, capacity });
		}
	}
	if (store) {
		for (const [ type, amount ] of Object.entries(store)) {
			if (capacityByResource?.[type as ResourceType] === undefined) {
				resources.push({ type, amount, capacity: capacityByResource?.[type as ResourceType] ?? 0 });
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
		[Amount]: store ? Object.values(store).reduce((sum, amount) => sum + amount, 0) : 0,
		[Capacity]: calculatedCapacity,
		[Resources]: singleResource,
		[Restricted]: isRestricted,
		[SingleResource]: singleResource,
	});
}
