import { declare, enumerated, vector } from '~/lib/schema';
import * as C from '~/game/constants';
import { Store } from '~/game/store';

export const resourceEnumFormat = declare('ResourceType', enumerated(undefined, ...C.RESOURCES_ALL));

export const shape = declare('Store', {
	_amount: 'int32',
	_capacity: 'int32',
	_resources: vector({
		amount: 'int32',
		capacity: 'int32',
		type: resourceEnumFormat,
	}),
	_restricted: 'bool',
	_singleResource: resourceEnumFormat,
});

export const format = declare(shape, { overlay: Store });
