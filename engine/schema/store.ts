import { declare, vector, withType, TypeOf } from 'xxscreeps/schema';
import { ResourceType, Store } from 'xxscreeps/game/store';
import { optionalResourceEnumFormat } from './resource';

export type Shape = TypeOf<typeof shape>;
const shape = declare('Store', {
	_amount: 'int32',
	_capacity: 'int32',
	_resources: vector({
		amount: 'int32',
		capacity: 'int32',
		type: optionalResourceEnumFormat,
	}),
	_restricted: 'bool',
	_singleResource: optionalResourceEnumFormat,
});

export const format = withType<Store<ResourceType>>(
	declare(shape, { overlay: Store }));

export function restricted<Resource extends ResourceType>() {
	return withType<Store<Resource>>(format);
}
