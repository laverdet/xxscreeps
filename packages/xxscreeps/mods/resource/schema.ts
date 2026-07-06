import type { ResourceType } from './resource.js';
import { enumeratedForPath } from 'xxscreeps/engine/schema/index.js';
import * as C from 'xxscreeps/game/constants/index.js';
import { compose, declare, enumerated, struct, vector, withType } from 'xxscreeps/schema/index.js';
import { OpenStore, RestrictedStore, SingleStore } from './store.js';

// Resource types
export const optionalResourceEnumFormat = () =>
	declare('ResourceType', enumerated(undefined, C.RESOURCE_ENERGY, C.RESOURCE_POWER, ...enumeratedForPath<ResourceSchema>()('ResourceType')));

// nb: This is the same wire format as `optionalResourceEnumFormat` and 0 would be an invalid `undefined`.
export const resourceEnumFormat = withType<ResourceType>(optionalResourceEnumFormat);

// Stores
export const openStoreFormat = () => compose(shapeOpen, OpenStore);
export const restrictedStoreFormat = () => compose(shapeRestricted, RestrictedStore);

// SingleStore requires a burned in type which can only be achieved with a function call. The
// `makeSingleStoreFormat` thunk is meant to be invoked immediately. It returns the deferred
// `untypedSingleStore`
const untypedSingleStore = () => compose(shapeSingle, SingleStore);
export function makeSingleStoreFormat<Resource extends ResourceType = typeof C.RESOURCE_ENERGY>() {
	return withType<SingleStore<Resource>>(untypedSingleStore);
}

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

// ---

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface ResourceSchema {}
