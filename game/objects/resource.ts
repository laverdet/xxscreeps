import * as C from 'xxscreeps/game/constants';
import { compose, declare, enumerated, struct, variant, withOverlay, withType, TypeOf } from 'xxscreeps/schema';
import * as RoomObject from './room-object';

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
export class Resource extends withOverlay(shape)(RoomObject.RoomObject) {
	get energy() { return this.resourceType === 'energy' ? this.amount : undefined }
	get _lookType() { return C.LOOK_RESOURCES }
}
