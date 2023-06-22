import type { RoomPosition } from 'xxscreeps/game/position.js';
import type { Schema } from './index.js';
import C from 'xxscreeps/game/constants/index.js';
import * as RoomObject from 'xxscreeps/game/object.js';
import { enumeratedForPath } from 'xxscreeps/engine/schema/index.js';
import { compose, declare, enumerated, struct, variant, withOverlay, withType } from 'xxscreeps/schema/index.js';
import { assign } from 'xxscreeps/utility/utility.js';

// Enum schema for resource types
// HACK: If an enumerated schema contains `undefined` then TS collapses the result to `any` when
// exporting as CommonJS. So we have to declare it twice here, once for TS and once for schema.
const extraResourceTypes = enumeratedForPath<Schema>()('ResourceType');
export type ResourceType = typeof C.RESOURCE_ENERGY | typeof C.RESOURCE_POWER | typeof extraResourceTypes[number];
export const optionalResourceEnumFormat = () => declare('ResourceType',
	enumerated(undefined, C.RESOURCE_ENERGY, C.RESOURCE_POWER, ...enumeratedForPath<Schema>()('ResourceType')));
export const resourceEnumFormat = withType<ResourceType>(optionalResourceEnumFormat);

// Schema for resource objects
export const format = declare('Resource', () => compose(shape, Resource));
const shape = struct(RoomObject.format, {
	...variant('resource'),
	amount: 'int32',
	resourceType: resourceEnumFormat,
});

// Game object
export class Resource extends withOverlay(RoomObject.RoomObject, shape) {
	get energy() { return this.resourceType === C.RESOURCE_ENERGY ? this.amount : undefined }
	get '#lookType'() { return C.LOOK_RESOURCES }
}

export function create(pos: RoomPosition, resourceType: ResourceType, amount: number) {
	return assign(RoomObject.create(new Resource, pos), {
		amount,
		resourceType,
	});
}
