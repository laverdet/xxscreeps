import type { RoomPosition } from 'xxscreeps/game/position.js';
import type { ResourceSchema } from 'xxscreeps:mods/game';
import { RoomObject, createRoomObject } from 'xxscreeps/game/object.js';
import { roomObjectShape } from 'xxscreeps/game/schema.js';
import { declare, struct, variant, withOverlay } from 'xxscreeps/schema/index.js';
import { assign } from 'xxscreeps/utility/utility.js';
import * as C from 'xxscreeps:mods/constants';
import { resourceEnumFormat } from './schema.js';

// Enum schema for resource types
export type ResourceType = `${ResourceSchema}`;

/** @internal */
export const resourceShape = declare('Resource', struct(roomObjectShape, {
	...variant('resource'),

	/**
	 * The amount of resource units containing.
	 * @public
	 * @see https://docs.screeps.com/api/#Resource.amount
	 */
	amount: 'int32',

	/**
	 * One of the `RESOURCE_*` constants.
	 * @public
	 * @see https://docs.screeps.com/api/#Resource.resourceType
	 */
	resourceType: resourceEnumFormat,
}));

// Game object
/**
 * A dropped piece of resource. It will decay after a while if not picked up. Dropped resource pile
 * decays for `ceil(amount/1000)` units per tick.
 * @public
 * @see https://docs.screeps.com/api/#Resource
 */
export class Resource extends withOverlay(RoomObject, resourceShape) {
	/**
	 * Same as `amount` if `resourceType` is `RESOURCE_ENERGY`, otherwise `undefined`. Legacy alias
	 * kept for compatibility; prefer `amount`.
	 * @deprecated
	 */
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
