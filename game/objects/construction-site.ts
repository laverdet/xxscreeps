import * as C from 'xxscreeps/game/constants';
import * as Game from 'xxscreeps/game/game';
import { withOverlay } from 'xxscreeps/schema';
import type { Shape } from 'xxscreeps/engine/schema/construction-site';
import { RoomObject } from './room-object';

export type ConstructibleStructureType = InstanceType<typeof ConstructionSite>['structureType'];

export class ConstructionSite extends withOverlay<Shape>()(RoomObject) {
	get my() { return this._owner === Game.me }
	get progressTotal() { return C.CONSTRUCTION_COST[this.structureType] }
	get _lookType() { return C.LOOK_CONSTRUCTION_SITES }
}
