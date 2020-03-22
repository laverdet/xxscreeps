import * as C from '~/engine/game/constants';
import { Amount, Capacity, Resources, ResourceType, Restricted, SingleResource, StorageRecord } from '~/engine/game/store';

export function create(store: StorageRecord, capacity?: number, restriction?: StorageRecord) {
	// First determine if this is a single resource store
	const storeEntries = Object.entries(store);
	const restrictionEntries = restriction === undefined ? undefined : Object.entries(restriction);
	const isSingleResource = function() {
		if (restrictionEntries === undefined) {
			return storeEntries.length <= 1;
		} else if (restrictionEntries.length === 1) {
			if (storeEntries.length > 1) {
				return false;
			} else if (storeEntries.length === 0) {
				return true;
			} else {
				return storeEntries[0][0] === restrictionEntries[0][0];
			}
		} else {
			return false;
		}
	}();

	// Generate store vector
	const resources = isSingleResource ? [] : storeEntries.map(([ type, amount ]) =>
		({ amount, capacity: restriction?.[type as ResourceType] ?? 0, type }),
	);
	if (restrictionEntries !== undefined) {
		for (const [ type, capacity ] of restrictionEntries) {
			if (store[type as ResourceType] === undefined) {
				resources.push({ amount: 0, capacity, type });
			}
		}
	}

	// Return data to save
	return {
		[Amount]: Object.values(store).reduce((sum, amount) => sum + amount, 0),
		[Capacity]: capacity,
		[Resources]: resources,
		[Restricted]: restriction !== undefined,
		[SingleResource]: isSingleResource ?
			(restrictionEntries?.length === 1 ? restrictionEntries[0][0] :
				storeEntries.length === 1 ? storeEntries[0][0] : C.RESOURCE_ENERGY) : undefined,
	};
}
