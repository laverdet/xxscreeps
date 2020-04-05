import * as C from '~/game/constants';
import { gameContext } from '~/game/context';
import { withOverlay } from '~/lib/schema';
import type { shape } from '~/engine/schema/construction-site';
import { RoomObject } from './room-object';

export type ConstructibleStructureType = InstanceType<typeof ConstructionSite>['structureType'];

export class ConstructionSite extends withOverlay<typeof shape>()(RoomObject) {
	get my() { return this._owner === gameContext.userId }
	get progressTotal() { return C.CONSTRUCTION_COST[this.structureType] }
}
