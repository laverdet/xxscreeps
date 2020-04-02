import * as C from '~/game/constants';
import { BufferObject } from '~/lib/schema/buffer-object';
import { withOverlay, BufferView } from '~/lib/schema';
import type { shape } from '~/engine/schema/store';
import type { Creep } from './objects/creep';
import type { StructureSpawn } from './objects/structures/spawn';

export type ResourceType = (typeof C.RESOURCES_ALL)[number];
export type StorageRecord = Partial<Record<ResourceType, number>>;

export const Amount = Symbol('amount');
export const Capacity = Symbol('capacity');
export const CapacityByResource = Symbol('capacityByResource');
export const Resources = Symbol('resources');
export const Restricted = Symbol('restricted');
export const SingleResource = Symbol('singleResource');

export type RoomObjectWithStore = Creep | StructureSpawn;

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
export class Store extends withOverlay<typeof shape>()(BufferObjectWithResourcesType) {
	constructor(view: BufferView, offset = 0) {
		super(view, offset);

		const singleResource = this[SingleResource];
		if (singleResource === undefined) {
			// Create capacity record
			if (this[Restricted]) {
				this[CapacityByResource] = new Map;
			}

			// Load up resources onto this object as properties
			for (const resource of this[Resources]) {
				this[CapacityByResource]?.set(resource.type!, resource.capacity);
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
	getCapacity(resourceType: typeof C.RESOURCE_ENERGY): number;
	getCapacity(resourceType?: ResourceType): number | null;
	getCapacity(resourceType?: ResourceType) {
		if (resourceType === undefined || this[CapacityByResource] === undefined) {
			return this[Capacity];
		} else {
			return this[CapacityByResource]!.get(resourceType) ?? null;
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
	getUsedCapacity(resourceType?: ResourceType) {
		if (resourceType === undefined) {
			if (this[CapacityByResource] === undefined) {
				return this[Amount];
			} else {
				return null;
			}
		} else if (this[CapacityByResource] === undefined) {
			return this[Amount];
		} else {
			return (this[CapacityByResource]!.get(resourceType) ?? 0) - (this[resourceType] ?? 0);
		}
	}

	energy = 0;
	[CapacityByResource]?: Map<ResourceType, number>;
}
