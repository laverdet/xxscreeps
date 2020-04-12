import { BufferObject } from '~/lib/schema/buffer-object';
import { withOverlay, BufferView } from '~/lib/schema';
import type { Shape } from '~/engine/schema/store';
import type { AnyRoomObject } from './room';
import type { ResourceType } from './objects/resource';
export type { ResourceType };

export type StorageRecord = Partial<Record<ResourceType, number>>;
export type RoomObjectWithStore = Extract<AnyRoomObject, { store: any }>;

// Adds resource types information to `Store` class. No changes from `extends BufferObject` as far
// as JS is concerned
const BufferObjectWithResourcesType = BufferObject as any as {
	prototype: Partial<Record<ResourceType, number>>;
};

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
	withOverlay<Shape>()(BufferObjectWithResourcesType) {
	constructor(view: BufferView, offset = 0) {
		super(view, offset);

		const singleResource = this._singleResource;
		if (singleResource === undefined) {
			// Create capacity record
			if (this._restricted) {
				this._capacityByResource = new Map;
			}

			// Load up resources onto this object as properties
			for (const resource of this._resources) {
				this._capacityByResource?.set(resource.type!, resource.capacity);
				if (resource.amount !== 0) {
					this[resource.type!] = resource.amount;
				}
			}
		} else {
			// This store can only ever hold one type of resource so we can skip the above mess. This is
			// true for spawns, extensions and a bunch of others.
			this[singleResource] = this._amount;
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
			return this._capacity;
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
			return this._amount;
		} else {
			return null;
		}
	}

	energy = 0;
	_capacityByResource?: Map<ResourceType, number>;
}
