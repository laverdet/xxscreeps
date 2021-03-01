import * as C from 'xxscreeps/game/constants';
import * as Id from 'xxscreeps/engine/util/schema/id';
import * as Game from 'xxscreeps/game/game';
import { compose, declare, enumerated, struct, variant, withOverlay } from 'xxscreeps/schema';
import * as RoomObject from './room-object';

export type ConstructibleStructureType = InstanceType<typeof ConstructionSite>['structureType'];

export function format() { return compose(shape, ConstructionSite) }
const shape = declare('ConstructionSite', struct(RoomObject.format, {
	...variant('constructionSite'),
	name: 'string',
	progress: 'int32',
	structureType: enumerated(...Object.keys(C.CONSTRUCTION_COST) as (keyof typeof C.CONSTRUCTION_COST)[]),
	_owner: Id.format,
}));

export class ConstructionSite extends withOverlay(shape)(RoomObject.RoomObject) {
	get my() { return this._owner === Game.me }
	get progressTotal() { return C.CONSTRUCTION_COST[this.structureType] }
	get _lookType() { return C.LOOK_CONSTRUCTION_SITES }
}
