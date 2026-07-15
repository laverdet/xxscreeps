import type { ResourceType } from './resource.js';
import type { OpenStore, RestrictedStore, SingleStore } from './store.js';
import { enumeratedForPath } from 'xxscreeps/engine/schema/index.js';
import * as C from 'xxscreeps/game/constants/index.js';
import { structureShape } from 'xxscreeps/mods/classic/structure/schema.js';
import { composeBind, declare, enumerated, struct, variant, vector, withType } from 'xxscreeps/schema/index.js';

// Resource types
export const optionalResourceEnumFormat = () =>
	declare('ResourceType', enumerated(undefined, C.RESOURCE_ENERGY, C.RESOURCE_POWER, ...enumeratedForPath<ResourceSchema>()('ResourceType')));

// nb: This is the same wire format as `optionalResourceEnumFormat` and 0 would be an invalid `undefined`.
export const resourceEnumFormat = withType<ResourceType>(optionalResourceEnumFormat);

/** @internal */
export const shapeOpen = declare('OpenStore', struct({
	'#capacity': 'int32',
	'#resources': vector(struct({
		amount: 'int32',
		type: resourceEnumFormat,
	})),
}));

/** @internal */
export const shapeRestricted = declare('RestrictedStore', struct({
	'#resources': vector(struct({
		amount: 'int32',
		capacity: 'int32',
		type: resourceEnumFormat,
	})),
}));

/** @internal */
export const shapeSingle = declare('SingleStore', struct({
	'#amount': 'int32',
	'#capacity': 'int32',
	'#type': resourceEnumFormat,
}));

// Stores
export function openStoreFormat() {
	return boundOpenStoreFormat;
}
const [ boundOpenStoreFormat, bindOpenStore ] = composeBind(shapeOpen)<OpenStore>();

export function restrictedStoreFormat() {
	return boundRestrictedStoreFormat;
}
const [ boundRestrictedStoreFormat, bindRestrictedStoreFormat ] = composeBind(shapeRestricted)<RestrictedStore>();

// SingleStore requires a burned in type which can only be achieved with a function call. The
// `makeSingleStoreFormat` thunk is meant to be invoked immediately. It returns the deferred
// `untypedSingleStore`
const [ untypedSingleStore, bindUntypedSingleStore ] = composeBind(shapeSingle)<SingleStore<never>>();
export function makeSingleStoreFormat<Resource extends ResourceType = typeof C.RESOURCE_ENERGY>() {
	return withType<SingleStore<Resource>>(untypedSingleStore);
}

/** @internal */
export { bindOpenStore, bindRestrictedStoreFormat, bindUntypedSingleStore };

// Container (the structure)
/** @internal */
export const containerShape = declare('Container', struct(structureShape, {
	...variant('container'),

	/**
	 * The current amount of hit points of the structure.
	 * @public
	 * @see https://docs.screeps.com/api/#StructureContainer.hits
	 */
	hits: 'int32',

	/**
	 * A [`Store`](https://docs.screeps.com/api/#Store) object that contains cargo of this structure.
	 * @public
	 * @see https://docs.screeps.com/api/#StructureContainer.store
	 */
	store: openStoreFormat,
	'#nextDecayTime': 'int32',
}));

// ---

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface ResourceSchema {}
