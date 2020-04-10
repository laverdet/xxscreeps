import * as C from '~/game/constants';
import * as Game from '~/game/game';
import { withOverlay } from '~/lib/schema';
import type { shape } from '~/engine/schema/construction-site';
import { RoomObject } from './room-object';

export type ConstructibleStructureType = InstanceType<typeof ConstructionSite>['structureType'];

export class ConstructionSite extends withOverlay<typeof shape>()(RoomObject) {
	get my() { return this._owner === Game.me }
	get progressTotal() { return C.CONSTRUCTION_COST[this.structureType] }
	get _lookType() { return C.LOOK_CONSTRUCTION_SITES }
}
