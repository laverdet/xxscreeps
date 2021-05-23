import type { BufferView } from 'xxscreeps/schema';
import type { ResourceType } from './resource';
import * as Fn from 'xxscreeps/utility/functional';
import { BufferObject } from 'xxscreeps/schema/buffer-object';
import { compose, declare, struct, vector, withOverlay, withType } from 'xxscreeps/schema';
import { assign } from 'xxscreeps/utility/utility';
import { optionalResourceEnumFormat } from './resource';
export type { ResourceType };

export type StorageRecord = Partial<Record<ResourceType, number>>;
export type WithStore = { store: Store };

export function format() { return withType<Store<ResourceType>>(declare('Store', compose(shape, Store))) }
export function restrictedFormat<Resource extends ResourceType>() {
	return withType<Store<Resource>>(format);
}
const shape = struct({
	'#amount': 'int32',
	'#capacity': 'int32',
	'#resources': vector(struct({
		amount: 'int32',
		capacity: 'int32',
		type: optionalResourceEnumFormat,
	})),
	'#restricted': 'bool',
	'#singleResource': optionalResourceEnumFormat,
});

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

	energy = 0;
	['#capacityByResource']?: Map<ResourceType, number>;

	constructor(view?: BufferView, offset?: number) {
		super(view, offset);

		const singleResource = this['#singleResource'];
		if (singleResource === undefined) {
			// Create capacity record
			if (this['#restricted']) {
				this['#capacityByResource'] = new Map;
			}

			// Load up resources onto this object as properties
			for (const resource of this['#resources']) {
				this['#capacityByResource']?.set(resource.type!, resource.capacity);
				if (resource.amount !== 0) {
					this[resource.type!] = resource.amount;
				}
			}
		} else {
			// This store can only ever hold one type of resource so we can skip the above mess. This is
			// true for spawns, extensions and a bunch of others.
			this[singleResource] = this['#amount'];
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
		const capacityByResource = this['#capacityByResource'];
		if (capacityByResource === undefined) {
			return this['#capacity'];
		// eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
		} else if (resourceType) {
			return capacityByResource.get(resourceType) ?? null;
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
		} else if (this['#capacityByResource'] === undefined) {
			return this['#amount'];
		} else {
			return null;
		}
	}

	/**
	 * Returns all resource entries in this Store. This is needed because quoted '#private' keys will
	 * be iterated when not in the runtime.
	 */
	['#entries'](): Iterable<[ ResourceType, number ]> {
		return Fn.reject(Object.entries(this), entry => entry[0].startsWith('#')) as never;
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
	const result = assign(new Store, { ...store });
	result['#amount'] = store ? Fn.accumulate(Object.values(store), amount => amount) : 0;
	result['#capacity'] = calculatedCapacity;
	result['#resources'] = singleResource === undefined ? resources : [];
	result['#restricted'] = isRestricted;
	result['#singleResource'] = singleResource;
	return result;
}
