import * as C from 'xxscreeps/game/constants';
import type { Shape } from 'xxscreeps/engine/schema/resource';
import { withOverlay } from 'xxscreeps/schema';
import { RoomObject } from './room-object';

export type ResourceType = typeof C.RESOURCES_ALL[number];
export class Resource extends withOverlay<Shape>()(RoomObject) {
	get energy() { return this.resourceType === 'energy' ? this.amount : undefined }
	get _lookType() { return C.LOOK_RESOURCES }
}
