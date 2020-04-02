import { bindInterceptors, bindName, makeEnum, makeVector, withSymbol } from '~/lib/schema';
import * as C from '~/game/constants';
import { Amount, Capacity, Resources, Restricted, SingleResource, Store } from '~/game/store';

export const resourceEnumFormat = bindName('ResourceType', makeEnum(undefined, ...C.RESOURCES_ALL));

export const shape = bindInterceptors('Store', {
	amount: 'int32',
	capacity: 'int32',
	resources: makeVector({
		amount: 'int32',
		capacity: 'int32',
		type: resourceEnumFormat,
	}),
	restricted: 'bool',
	singleResource: resourceEnumFormat,
}, {
	members: {
		amount: withSymbol(Amount),
		capacity: withSymbol(Capacity),
		resources: withSymbol(Resources),
		restricted: withSymbol(Restricted),
		singleResource: withSymbol(SingleResource),
	},
});

export const format = bindInterceptors(shape, { overlay: Store });
