import * as Fn from 'xxscreeps/utility/functional';
import { BufferObject } from 'xxscreeps/schema/buffer-object';
import { BufferView, compose, declare, struct, vector, withOverlay, withType, XSymbol } from 'xxscreeps/schema';
import { assign } from 'xxscreeps/utility/utility';
import { ResourceType, optionalResourceEnumFormat } from './resource';
export type { ResourceType };

export type StorageRecord = Partial<Record<ResourceType, number>>;
export type WithStore = { store: Store };

export const Amount = XSymbol('amount');
export const Capacity = XSymbol('capacity');
export const Resources = XSymbol('resources');
export const Restricted = XSymbol('restricted');
export const SingleResource = XSymbol('singleResource');

export function format() { return withType<Store<ResourceType>>(compose(shape, Store)) }
export function restrictedFormat<Resource extends ResourceType>() {
	return withType<Store<Resource>>(format);
}
const shape = declare('Store', struct({
	[Amount]: 'int32',
	[Capacity]: 'int32',
	[Resources]: vector(struct({
		amount: 'int32',
		capacity: 'int32',
		type: optionalResourceEnumFormat,
	})),
	[Restricted]: 'bool',
	[SingleResource]: optionalResourceEnumFormat,
}));

// Make `Store` indexable on any `ResourceType`
const BufferObjectWithResourcesType = withOverlay(BufferObject,
	withType<Partial<Record<ResourceType, number>>>('int8'));

/**
 * An object that can contain resources in its cargo.
 *
 * There are two types of stores in the game: general purpose stores and limited stores.
 *
 * General purpose stores can contain any resource within its capacity (e.g. creeps, containers,
 * storages, terminals).
 *
 * Limited stores can contain only a few types of resources needed for that particular object (e.g.
 * spawns, extensions, labs, nukers).
 *
 * The `Store` prototype is the same for both types of stores, but they have different behavior
 * depending on the `resource` argument in its methods.
 *
 * You can get specific resources from the store by addressing them as object properties:
 *
 * ```
 * console.log(creep.store[RESOURCE_ENERGY]);
 * ```
 */
export class Store<Resources extends ResourceType = any> extends
	withOverlay(BufferObjectWithResourcesType, shape) {
	constructor(view?: BufferView, offset?: number) {
		super(view, offset);

		const singleResource = this[SingleResource];
		if (singleResource === undefined) {
			// Create capacity record
			if (this[Restricted]) {
				this._capacityByResource = new Map;
			}

			// Load up resources onto this object as properties
			for (const resource of this[Resources]) {
				this._capacityByResource?.set(resource.type!, resource.capacity);
				if (resource.amount !== 0) {
					this[resource.type!] = resource.amount;
				}
			}
		} else {
			// This store can only ever hold one type of resource so we can skip the above mess. This is
			// true for spawns, extensions and a bunch of others.
			this[singleResource] = this[Amount];
		}
	}

	/**
	 * Returns capacity of this store for the specified resource, or total capacity if `resource` is
	 * undefined.
	 * @param resourceType The type of resource
	 * @returns Capacity, or null in case of a not valid resource for this store type
	 */
	getCapacity(): Resources extends ResourceType ? number : null;
	getCapacity(resourceType: Exclude<ResourceType, Resources>): number | null;
	getCapacity(resourceType?: Resources): number;
	getCapacity(resourceType?: ResourceType): number | null;
	getCapacity(resourceType?: ResourceType) {
		if (this._capacityByResource === undefined) {
			return this[Capacity];
		// eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
		} else if (resourceType) {
			return this._capacityByResource.get(resourceType) ?? null;
		} else {
			return null;
		}
	}

	/**
	 * A shorthand for `getCapacity(resource) - getUsedCapacity(resource)`.
	 * @param resourceType The type of resource
	 */
	getFreeCapacity(resourceType?: ResourceType) {
		return this.getCapacity(resourceType)! - this.getUsedCapacity(resourceType)!;
	}

	/**
	 * Returns the capacity used by the specified resource, or total used capacity for general purpose
	 * stores if resource is undefined.
	 * @param resourceType The type of resource
	 * @returns Used capacity, or null in case of a not valid resource for this store type
	 */
	getUsedCapacity(): Resources extends ResourceType ? number : null;
	getUsedCapacity(resourceType: Exclude<ResourceType, Resources>): number | null;
	getUsedCapacity(resourceType: Resources): number;
	getUsedCapacity(resourceType?: ResourceType): number | null;
	getUsedCapacity(resourceType?: ResourceType) {
		// eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
		if (resourceType) {
			return this[resourceType] ?? 0;
		} else if (this._capacityByResource === undefined) {
			return this[Amount];
		} else {
			return null;
		}
	}

	energy = 0;
	_capacityByResource?: Map<ResourceType, number>;
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
	return assign(new Store, {
		...store as any,
		[Amount]: store ? Fn.accumulate(Object.values(store), amount => amount!) : 0,
		[Capacity]: calculatedCapacity,
		[Resources]: singleResource === undefined ? resources : [],
		[Restricted]: isRestricted,
		[SingleResource]: singleResource,
	});
}
