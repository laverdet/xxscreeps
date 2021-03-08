import type { RoomPosition } from 'xxscreeps/game/position';
import * as C from 'xxscreeps/game/constants';
import * as RoomObject from './room-object';
import { compose, declare, enumerated, struct, variant, withOverlay, withType, TypeOf } from 'xxscreeps/schema';
import { assign } from 'xxscreeps/util/utility';

// Enum schema for resource types
export type ResourceType = typeof C.RESOURCES_ALL[number];
export const optionalResourceEnumFormat = declare('ResourceType', enumerated(undefined, ...C.RESOURCES_ALL));
export const resourceEnumFormat = withType<
	Exclude<TypeOf<typeof optionalResourceEnumFormat>, undefined>
>(optionalResourceEnumFormat);

// Schema for resource objects
export function format() { return compose(shape, Resource) }
const shape = declare('Resource', struct(RoomObject.format, {
	...variant('resource'),
	amount: 'int32',
	resourceType: resourceEnumFormat,
}));

// Game object
export class Resource extends withOverlay(RoomObject.RoomObject, shape) {
	get energy() { return this.resourceType === 'energy' ? this.amount : undefined }
	get _lookType() { return C.LOOK_RESOURCES }
}

export function create(pos: RoomPosition, resourceType: ResourceType, amount: number) {
	return assign(RoomObject.create(new Resource, pos), {
		amount,
		resourceType,
	});
}
