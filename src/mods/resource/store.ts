import type { BufferView, TypeOf } from 'xxscreeps/schema';
import type { ResourceType } from './resource';
import C from 'xxscreeps/game/constants';
import Fn from 'xxscreeps/utility/functional';
import { BufferObject } from 'xxscreeps/schema/buffer-object';
import { compose, declare, makeReader, struct, vector, withOverlay, withType } from 'xxscreeps/schema';
import { getLayout } from 'xxscreeps/schema/layout';
import { resourceEnumFormat } from './resource';
import { hooks } from 'xxscreeps/game';

export type WithStore = Record<'store', Store>;

export const openStoreFormat = () => declare('OpenStore', compose(shapeOpen, OpenStore));
export const restrictedStoreFormat = () => declare('RestrictedStore', compose(shapeRestricted, RestrictedStore));
const untypedSingleStoreFormat = () => declare('SingleStore', compose(shapeSingle, SingleStore));
export const singleStoreFormat = <Resource extends ResourceType = typeof C.RESOURCE_ENERGY>() =>
	withType<SingleStore<Resource>>(untypedSingleStoreFormat);

// Make `Store` indexable on any `ResourceType`
const BufferObjectWithResourcesType = withOverlay(BufferObject,
	withType<Record<ResourceType, number>>('int8'));

// Set up default value for all resources on `Store`
hooks.register('environment', () => {
	for (const resourceType of C.RESOURCES_ALL) {
		Object.defineProperty(Store.prototype, resourceType, { value: 0, writable: true });
	}
});

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

	['#entries'](): Iterable<[ ResourceType, number ]> {
		return Object.entries(this) as never;
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
	// Undocumented screeps property
	declare _sum: number;

	constructor(view?: BufferView, offset?: number) {
		super(view, offset);
		Object.defineProperty(this, '_sum', { value: 0, writable: true });
		for (const info of this['#resources']) {
			this[info.type] = info.amount;
			this._sum += info.amount;
		}
	}

	static ['#create'](capacity: number) {
		const instance = new OpenStore;
		instance['#capacity'] = capacity;
		return instance;
	}

	getCapacity(_resourceType?: ResourceType) {
		return this['#capacity'];
	}

	getUsedCapacity(resourceType?: ResourceType) {
		if (resourceType) {
			return this[resourceType];
		} else {
			return this._sum;
		}
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
		this._sum += amount;
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
			delete this[type];
		} else {
			this[type]! -= amount;
		}
		this._sum -= amount;
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
 * @deprecated Remove schema hack!
 */
export class RestrictedStore extends withOverlay(Store, shapeRestricted) {
	constructor(view?: BufferView, offset?: number) {
		super(view, offset);
		for (const info of this['#resources']) {
			if (info.amount > 0) {
				this[info.type] = info.amount;
			}
		}
	}

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
		if (resourceType) {
			return this[resourceType];
		} else {
			return null;
		}
	}

	['#add'](type: ResourceType, amount: number) {
		const info = this['#resources'].find(info => info.type === type)!;
		this[type] = info.amount += amount;
	}

	['#subtract'](type: ResourceType, amount: number) {
		const info = this['#resources'].find(info => info.type === type)!;
		if ((info.amount -= amount) === 0) {
			delete this[type];
		} else {
			this[type] = info.amount;
		}
	}
}
// TODO: This is needed to initialize the getters of the unused store implementation, just for
// testing
makeReader({ ...getLayout(restrictedStoreFormat, new Map), version: 0 });

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
		if (this['#amount'] > 0) {
			this[this['#type']] = this['#amount'];
		}
	}

	static ['#create']<Type extends ResourceType>(type: Type, capacity: number, amount = 0) {
		const instance = new SingleStore<Type>();
		if (amount > 0) {
			instance[type] = amount;
		}
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
		if (resourceType) {
			return this[resourceType];
		} else {
			return null;
		}
	}

	['#add'](type: ResourceType, amount: number) {
		this[type] = this['#amount'] += amount;
	}

	['#subtract'](type: ResourceType, amount: number) {
		const value = this['#amount'] -= amount;
		if (value === 0) {
			delete this[type];
		} else {
			this[type] = value;
		}
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
	if (target.store.getFreeCapacity(resourceType) >= Math.max(1, amount)) {
		return C.OK;
	} else {
		return C.ERR_FULL;
	}
}

export function checkHasResource(target: WithStore, resourceType: ResourceType, amount = 1) {
	if (!C.RESOURCES_ALL.includes(resourceType)) {
		return C.ERR_INVALID_ARGS;
	} else if (typeof amount !== 'number' || amount < 0) {
		return C.ERR_INVALID_ARGS;
	} else if (target.store[resourceType]! >= Math.max(1, amount)) {
		return C.OK;
	} else {
		return C.ERR_NOT_ENOUGH_RESOURCES;
	}
}
