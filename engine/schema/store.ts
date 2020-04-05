import { declare, enumerated, vector, withSymbol } from '~/lib/schema';
import * as C from '~/game/constants';
import { Amount, Capacity, Resources, Restricted, SingleResource, Store } from '~/game/store';

export const resourceEnumFormat = declare('ResourceType', enumerated(undefined, ...C.RESOURCES_ALL));

export const shape = declare('Store', {
	amount: withSymbol(Amount, 'int32'),
	capacity: withSymbol(Capacity, 'int32'),
	resources: withSymbol(Resources, vector({
		amount: 'int32',
		capacity: 'int32',
		type: resourceEnumFormat,
	})),
	restricted: withSymbol(Restricted, 'bool'),
	singleResource: withSymbol(SingleResource, resourceEnumFormat),
});

export const format = declare(shape, { overlay: Store });
