import type { ResourceType } from './resource.js';
import type { BufferView, TypeOf } from 'xxscreeps/schema/index.js';
import { Fn } from 'xxscreeps/functional/fn.js';
import { chainIntentChecks } from 'xxscreeps/game/checks.js';
import { BufferObject } from 'xxscreeps/schema/buffer-object.js';
import { makeReader, withOverlay, withType } from 'xxscreeps/schema/index.js';
import { getLayout } from 'xxscreeps/schema/layout.js';
import * as C from 'xxscreeps:mods/constants';
import { bindOpenStore, bindRestrictedStoreFormat, bindUntypedSingleStore, restrictedStoreFormat, shapeOpen, shapeRestricted, shapeSingle } from './schema.js';

export type WithStore = Record<'store', Store>;

// Make `Store` indexable on any `ResourceType`
const BufferObjectWithResourcesType = withOverlay(BufferObject,
	withType<Record<ResourceType, number>>('int8'));

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
 * @public
 * @see https://docs.screeps.com/api/#Store
 */
export abstract class Store extends BufferObjectWithResourcesType {
	/**
	 * Returns free capacity for the store. For a limited store, it returns the capacity available for
	 * the specified resource if `resource` is defined and valid for this store.
	 * @param resourceType The type of the resource.
	 * @returns Returns available capacity number, or `null` in case of an invalid `resource` for this
	 * store type.
	 * @public
	 * @see https://docs.screeps.com/api/#Store.getFreeCapacity
	 */
	getFreeCapacity(resourceType?: ResourceType): number | null {
		const capacity = this.getCapacity(resourceType);
		const used = this.getUsedCapacity(resourceType);
		if (capacity === null || used === null) {
			return null;
		}
		return capacity - used;
	}

	'#doesAllowWithdraw'() { return true; }

	'#entries'(): Iterable<[ ResourceType, number ]> {
		return Object.entries(this) as never;
	}

	private [Symbol.for('nodejs.util.inspect.custom')]() {
		return {
			[Symbol('capacity')]: this['#storeCapacityResource']() ?? this.getCapacity(),
			...Fn.fromEntries(this['#entries']()),
		};
	}

	abstract ['#add'](type: ResourceType, amount: number): void;
	abstract ['#subtract'](type: ResourceType, amount: number): void;

	/**
	 * Returns capacity of this store for the specified resource. For a general purpose store, it
	 * returns total capacity if `resource` is undefined.
	 * @param resourceType The type of the resource.
	 * @returns Returns capacity number, or `null` in case of an invalid `resource` for this store
	 * type.
	 * @public
	 * @see https://docs.screeps.com/api/#Store.getCapacity
	 */
	abstract getCapacity(resourceType?: ResourceType): number | null;

	/**
	 * Returns the capacity used by the specified resource. For a general purpose store, it returns
	 * total used capacity if `resource` is undefined.
	 * @param resourceType The type of the resource.
	 * @returns Returns used capacity number, or `null` in case of a not valid `resource` for this
	 * store type.
	 * @public
	 * @see https://docs.screeps.com/api/#Store.getUsedCapacity
	 */
	abstract getUsedCapacity(resourceType?: ResourceType): number | null;

	abstract '#storeCapacityResource'(): Record<string, number> | null;
}

/**
 * A `Store` which can hold any resource and shares capacity between them.
 * @public
 */
export class OpenStore extends withOverlay(Store, () => shapeOpen) {
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

	static '#create'(capacity: number) {
		const instance = new OpenStore();
		instance['#capacity'] = capacity;
		return instance;
	}

	'#storeCapacityResource'() {
		return null;
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

	override getFreeCapacity(_resourceType?: ResourceType) {
		return this['#capacity'] - this._sum;
	}

	'#add'(type: ResourceType, amount: number) {
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

	'#subtract'(type: ResourceType, amount: number) {
		if (amount === 0) {
			return;
		}
		const resources = this['#resources'];
		const ii = resources.findIndex(info => info.type === type);
		// nb: We assume it is an invariant to invoke this function with an undefined resource
		const info = resources[ii]!;
		if ((info.amount -= amount) === 0) {
			resources[ii] = resources.at(-1)!;
			resources.pop();
			delete this[type];
		} else {
			this[type] -= amount;
		}
		this._sum -= amount;
	}
}

bindOpenStore(OpenStore);

type RestrictedResourceInfo = TypeOf<typeof shapeRestricted>['#resources'][number];
type StorageRecord = Record<ResourceType, number>;

/**
 * A `Store` which can only hold a certain amount of each resource.
 * @deprecated Remove schema hack!
 */
export class RestrictedStore extends withOverlay(Store, () => shapeRestricted) {
	constructor(view?: BufferView, offset?: number) {
		// TODO: This is needed to initialize the getters of the unused store implementation, just for
		// testing
		makeReader({ ...getLayout(restrictedStoreFormat, new Map()), version: 0 });
		super(view, offset);
		for (const info of this['#resources']) {
			if (info.amount > 0) {
				this[info.type] = info.amount;
			}
		}
	}

	static '#create'(capacities: Partial<StorageRecord>) {
		const instance = new RestrictedStore();
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

	'#storeCapacityResource'() {
		const result = Object.create(null) as Record<string, number>;
		for (const info of this['#resources']) {
			result[info.type] = info.capacity;
		}
		return result;
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

	'#add'(type: ResourceType, amount: number) {
		const info = this['#resources'].find(info => info.type === type)!;
		this[type] = info.amount += amount;
	}

	'#subtract'(type: ResourceType, amount: number) {
		const info = this['#resources'].find(info => info.type === type)!;
		if ((info.amount -= amount) === 0) {
			delete this[type];
		} else {
			this[type] = info.amount;
		}
	}
}

bindRestrictedStoreFormat(RestrictedStore);

/**
 * A `Store` which can only hold a single pre-defined resource.
 */
export class SingleStore<Type extends ResourceType> extends withOverlay(Store, () => shapeSingle) {
	constructor(view?: BufferView, offset?: number) {
		super(view, offset);
		if (this['#amount'] > 0) {
			this[this['#type']] = this['#amount'];
		}
	}

	static '#create'<Type extends ResourceType>(type: Type, capacity: number, amount = 0) {
		const instance = new SingleStore<Type>();
		if (amount > 0) {
			instance[type] = amount;
		}
		instance['#amount'] = amount;
		instance['#capacity'] = capacity;
		instance['#type'] = type;
		return instance;
	}

	'#storeCapacityResource'() {
		const result = Object.create(null) as Record<string, number>;
		result[this['#type']] = this['#capacity'];
		return result;
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
		if (resourceType === this['#type']) {
			return this[resourceType];
		} else {
			return null;
		}
	}

	'#add'(type: ResourceType, amount: number) {
		this[type] = this['#amount'] += amount;
	}

	'#subtract'(type: ResourceType, amount: number) {
		const value = this['#amount'] -= amount;
		if (value === 0) {
			delete this[type];
		} else {
			this[type] = value;
		}
	}
}

bindUntypedSingleStore(SingleStore);

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
	const free = target.store.getFreeCapacity(resourceType);
	if (free === null) {
		return C.ERR_INVALID_TARGET;
	} else if (free >= Math.max(1, amount)) {
		return C.OK;
	} else {
		return C.ERR_FULL;
	}
}

export function checkResourceArgs(resourceType: ResourceType | undefined, amount: number) {
	if (!C.RESOURCES_ALL.includes(resourceType!)) {
		return C.ERR_INVALID_ARGS;
	} else if (typeof amount !== 'number' || amount < 0) {
		return C.ERR_INVALID_ARGS;
	}
	return C.OK;
}

export function checkStoreAccepts(target: WithStore, resourceType: ResourceType) {
	return target.store.getCapacity(resourceType) === null
		? C.ERR_INVALID_TARGET : C.OK;
}

export function checkHasResourceAmount(target: WithStore, resourceType: ResourceType, amount: number) {
	return target.store[resourceType] >= Math.max(1, amount)
		? C.OK : C.ERR_NOT_ENOUGH_RESOURCES;
}

// TODO: `checkResourceArgs` and `checkStoreAccepts` should be called individually before invoking
// this one. If all call sites are ok then the nested intent checks here should be removed
export function checkHasResource(target: WithStore, resourceType: ResourceType | undefined, amount = 1) {
	return chainIntentChecks(
		() => checkResourceArgs(resourceType, amount),
		() => checkStoreAccepts(target, resourceType!),
		() => checkHasResourceAmount(target, resourceType!, amount));
}
