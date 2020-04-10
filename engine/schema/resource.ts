import * as C from '~/game/constants';
import { declare, enumerated, inherit, variant, withType, TypeOf } from '~/lib/schema';
import { Resource } from '~/game/objects/resource';
import * as RoomObject from './room-object';

export const optionalResourceEnumFormat = declare('ResourceType', enumerated(undefined, ...C.RESOURCES_ALL));
export const resourceEnumFormat = withType<
	Exclude<TypeOf<typeof optionalResourceEnumFormat>, undefined>
>(optionalResourceEnumFormat);

export const shape = declare('Resource', {
	...inherit(RoomObject.format),
	...variant('resource'),
	amount: 'int32',
	resourceType: resourceEnumFormat,
});

export const format = declare(shape, { overlay: Resource });
