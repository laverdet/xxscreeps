import type { RoomPosition } from 'xxscreeps/game/position';
import * as C from 'xxscreeps/game/constants';
import * as RoomObject from 'xxscreeps/game/object';
import { enumeratedForPath } from 'xxscreeps/engine/schema';
import { compose, declare, enumerated, struct, variant, withOverlay, withType } from 'xxscreeps/schema';
import { assign } from 'xxscreeps/utility/utility';

// Enum schema for resource types
// HACK: If an enumerated schema contains `undefined` then TS collapses the result to `any` when
// exporting as CommonJS. So we have to declare it twice here, once for TS and once for schema.
const extraResourceTypes = enumeratedForPath('ResourceType');
export type ResourceType = typeof C.RESOURCE_ENERGY | typeof C.RESOURCE_POWER | typeof extraResourceTypes[number];
export const optionalResourceEnumFormat = () => declare('ResourceType',
	enumerated(undefined, C.RESOURCE_ENERGY, C.RESOURCE_POWER, ...enumeratedForPath('ResourceType')));
export const resourceEnumFormat = withType<ResourceType>(optionalResourceEnumFormat);

// Schema for resource objects
export const format = () => compose(shape, Resource);
const shape = declare('Resource', struct(RoomObject.format, {
	...variant('resource'),
	amount: 'int32',
	resourceType: resourceEnumFormat,
}));

// Game object
export class Resource extends withOverlay(RoomObject.RoomObject, shape) {
	get energy() { return this.resourceType === C.RESOURCE_ENERGY ? this.amount : undefined }
	get [RoomObject.LookType]() { return C.LOOK_RESOURCES }
}

export function create(pos: RoomPosition, resourceType: ResourceType, amount: number) {
	return assign(RoomObject.create(new Resource, pos), {
		amount,
		resourceType,
	});
}
