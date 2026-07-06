import type { ResourceSchema } from './schema.js';
import type { RoomPosition } from 'xxscreeps/game/position.js';
import { enumeratedForPath } from 'xxscreeps/engine/schema/index.js';
import * as C from 'xxscreeps/game/constants/index.js';
import { RoomObject, createRoomObject } from 'xxscreeps/game/object.js';
import { roomObjectShape } from 'xxscreeps/game/schema.js';
import { declare, struct, variant, withOverlay } from 'xxscreeps/schema/index.js';
import { assign } from 'xxscreeps/utility/utility.js';
import { resourceEnumFormat } from './schema.js';

// Enum schema for resource types
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const extraResourceTypes = enumeratedForPath<ResourceSchema>()('ResourceType');
export type ResourceType = typeof C.RESOURCE_ENERGY | typeof C.RESOURCE_POWER | typeof extraResourceTypes[number];

/** @internal */
export const resourceShape = declare('Resource', struct(roomObjectShape, {
	...variant('resource'),
	amount: 'int32',
	resourceType: resourceEnumFormat,
}));

// Game object
export class Resource extends withOverlay(RoomObject, resourceShape) {
	get energy() { return this.resourceType === C.RESOURCE_ENERGY ? this.amount : undefined; }
	override get '#secondaryLookType'() { return C.LOOK_ENERGY; }
	get '#lookType'() { return C.LOOK_RESOURCES; }

	override '#applyNukeImpact'() {
		this['#destroy'](C.EVENT_ATTACK_TYPE_NUKE);
	}
}

export function create(pos: RoomPosition, resourceType: ResourceType, amount: number) {
	return assign(createRoomObject(new Resource(), pos), {
		amount,
		resourceType,
	});
}
