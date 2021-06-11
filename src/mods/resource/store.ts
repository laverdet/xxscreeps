import type { BufferView, TypeOf } from 'xxscreeps/schema';
import type { ResourceType } from './resource';
import * as C from 'xxscreeps/game/constants';
import * as Fn from 'xxscreeps/utility/functional';
import { BufferObject } from 'xxscreeps/schema/buffer-object';
import { compose, declare, struct, vector, withOverlay, withType } from 'xxscreeps/schema';
import { resourceEnumFormat } from './resource';

export type WithStore = Record<'store', Store>;

export const openStoreFormat = () => declare('OpenStore', compose(shapeOpen, OpenStore));
export const restrictedStoreFormat = () => declare('RestrictedStore', compose(shapeRestricted, RestrictedStore));
const untypedSingleStoreFormat = () => declare('SingleStore', compose(shapeSingle, SingleStore));
export const singleStoreFormat = <Resource extends ResourceType = typeof C.RESOURCE_ENERGY>() =>
	withType<SingleStore<Resource>>(untypedSingleStoreFormat);

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
export abstract class Store extends BufferObjectWithResourcesType {
	energy = 0;

	abstract ['#add'](type: ResourceType, amount: number): void;
	abstract ['#subtract'](type: ResourceType, amount: number): void;

	/**
	 * Returns capacity of this store for the specified resource, or total capacity if `resource` is
	 * undefined.
	 * @param resourceType The type of resource
	 * @returns Capacity, or null in case of a not valid resource for this store type
	 */
	abstract getCapacity(resourceType?: ResourceType): number | null;

	/**
	 * Returns the capacity used by the specified resource, or total used capacity for general purpose
	 * stores if resource is undefined.
	 * @param resourceType The type of resource
	 * @returns Used capacity, or null in case of a not valid resource for this store type
	 */
	abstract getUsedCapacity(resourceType?: ResourceType): number | null;

	/**
	 * A shorthand for `getCapacity(resource) - getUsedCapacity(resource)`.
	 * @param resourceType The type of resource
	 */
	getFreeCapacity(resourceType?: ResourceType) {
		return this.getCapacity(resourceType)! - this.getUsedCapacity(resourceType)!;
	}

	['#entries']() {
		return Object.entries(this) as [ ResourceType, number ][];
	}

	private [Symbol.for('nodejs.util.inspect.custom')]() {
		const capacity = this.getCapacity();
		return {
			[Symbol('capacity')]: capacity === null ?
				Object.fromEntries(Fn.map(this['#entries'](), ([ type ]) => [ type, this.getCapacity(type) ])) :
				capacity,
			...Fn.fromEntries(this['#entries']()),
		};
	}
}

const shapeOpen = struct({
	'#capacity': 'int32',
	'#resources': vector(struct({
		amount: 'int32',
		type: resourceEnumFormat,
	})),
});

/**
 * A `Store` which can hold any resource and shares capacity between them.
 */
export class OpenStore extends withOverlay(Store, shapeOpen) {
	#amount = 0;

	constructor(view?: BufferView, offset?: number) {
		super(view, offset);
		for (const info of this['#resources']) {
			this[info.type] = info.amount;
			this.#amount += info.amount;
		}
	}

	static ['#create'](capacity: number) {
		const instance = new OpenStore;
		instance['#capacity'] = capacity;
		return instance;
	}

	getCapacity() {
		return this['#capacity'];
	}

	getUsedCapacity() {
		return this.#amount;
	}

	['#add'](type: ResourceType, amount: number) {
		if (amount === 0) {
			return;
		}
		const info = this['#resources'].find(info => info.type === type);
		if (info) {
			this[type] = info.amount += amount;
		} else {
			this['#resources'].push({
				amount,
				type,
			});
			this[type] = amount;
		}
		this.#amount += amount;
	}

	['#subtract'](type: ResourceType, amount: number) {
		if (amount === 0) {
			return;
		}
		const resources = this['#resources'];
		const ii = resources.findIndex(info => info.type === type)!;
		const info = resources[ii];
		if ((info.amount -= amount) === 0) {
			resources[ii] = resources[resources.length - 1];
			resources.pop();
			if (type === C.RESOURCE_ENERGY) {
				this[type] = 0;
			} else {
				delete this[type];
			}
		}
		this.#amount -= amount;
	}
}

const shapeRestricted = struct({
	'#resources': vector(struct({
		amount: 'int32',
		capacity: 'int32',
		type: resourceEnumFormat,
	})),
});

type RestrictedResourceInfo = TypeOf<typeof shapeRestricted>['#resources'][number];
type StorageRecord = Record<ResourceType, number>;

/**
 * A `Store` which can only hold a certain amount of each resource.
 */
export class RestrictedStore extends withOverlay(Store, shapeRestricted) {
	static ['#create'](capacities: Partial<StorageRecord>) {
		const instance = new RestrictedStore;
		for (const type in capacities) {
			const info: RestrictedResourceInfo = {
				amount: 0,
				capacity: capacities[type as ResourceType]!,
				type: type as ResourceType,
			};
			instance['#resources'].push(info);
		}
		return instance;
	}

	getCapacity(resourceType?: ResourceType) {
		return this['#resources'].find(info => info.type === resourceType)?.capacity ?? null;
	}

	getUsedCapacity(resourceType?: ResourceType) {
		return this[resourceType!] ?? null;
	}

	['#add'](type: ResourceType, amount: number) {
		const info = this['#resources'].find(info => info.type === type)!;
		this[type] = info.amount += amount;
	}

	['#subtract'](type: ResourceType, amount: number) {
		const info = this['#resources'].find(info => info.type === type)!;
		this[type] = info.amount -= amount;
		if (type !== C.RESOURCE_ENERGY && this[type] === 0) {
			delete this[type];
		}
	}
}

const shapeSingle = struct({
	'#amount': 'int32',
	'#capacity': 'int32',
	'#type': resourceEnumFormat,
});

/**
 * A `Store` which can only hold a single pre-defined resource.
 */
export class SingleStore<Type extends ResourceType> extends withOverlay(Store, shapeSingle) {
	constructor(view?: BufferView, offset?: number) {
		super(view, offset);
		this[this['#type']] = this['#amount'];
	}

	static ['#create']<Type extends ResourceType>(type: Type, capacity: number, amount = 0) {
		const instance = new SingleStore<Type>();
		instance[type] = amount;
		instance['#amount'] = amount;
		instance['#capacity'] = capacity;
		instance['#type'] = type;
		return instance;
	}

	getCapacity(resourceType: Type): number;
	getCapacity(resourceType?: ResourceType): number | null;
	getCapacity(resourceType?: Type) {
		if (resourceType === this['#type']) {
			return this['#capacity'];
		} else {
			return null;
		}
	}

	getUsedCapacity(resourceType: Type): number;
	getUsedCapacity(resourceType?: ResourceType): number | null;
	getUsedCapacity(resourceType?: Type): number | null {
		return this[resourceType!] ?? null;
	}

	['#add'](type: ResourceType, amount: number) {
		this[type] = this['#amount'] += amount;
	}

	['#subtract'](type: ResourceType, amount: number) {
		this[type] = this['#amount'] -= amount;
	}
}

/**
 * The `amount` for resource-moving intents usually needs to be calculated upfront, which is done
 * before object validity checks. This would result in an error like `Cannot read property 'store'
 * of undefined` being thrown to the user when ERR_INVALID_TARGET should have been returned instead.
 * This function checks that two stores are valid and invokes a function if so.
 */
export function calculateChecked(object1: WithStore | undefined, object2: WithStore | undefined, fn: () => number) {
	if (object1?.store instanceof Store && object2?.store instanceof Store) {
		return fn();
	} else {
		return NaN;
	}
}

export function checkHasCapacity(target: WithStore, resourceType: ResourceType, amount: number) {
	const capacity = target.store.getFreeCapacity(resourceType);
	if (capacity === 0 || !(target.store.getFreeCapacity(resourceType) >= amount)) {
		return C.ERR_FULL;
	} else {
		return C.OK;
	}
}

export function checkHasResource(target: WithStore, resourceType: ResourceType, amount = 1) {
	if (!C.RESOURCES_ALL.includes(resourceType)) {
		return C.ERR_INVALID_ARGS;
	} else if (typeof amount !== 'number' || amount < 0) {
		return C.ERR_INVALID_ARGS;
	} else if (target.store[resourceType]! >= amount) {
		return C.OK;
	} else {
		return C.ERR_NOT_ENOUGH_RESOURCES;
	}
}
