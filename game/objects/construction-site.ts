import type { RoomPosition } from 'xxscreeps/game/position';
import * as C from 'xxscreeps/game/constants';
import * as Id from 'xxscreeps/engine/schema/id';
import * as Game from 'xxscreeps/game/game';
import * as RoomObject from './room-object';
import { compose, declare, enumerated, struct, variant, withOverlay } from 'xxscreeps/schema';
import { assign } from 'xxscreeps/util/utility';

export type ConstructibleStructureType = InstanceType<typeof ConstructionSite>['structureType'];

export function format() { return compose(shape, ConstructionSite) }
const shape = declare('ConstructionSite', struct(RoomObject.format, {
	...variant('constructionSite'),
	name: 'string',
	progress: 'int32',
	structureType: enumerated(...Object.keys(C.CONSTRUCTION_COST) as (keyof typeof C.CONSTRUCTION_COST)[]),
	_owner: Id.format,
}));

export class ConstructionSite extends withOverlay(RoomObject.RoomObject, shape) {
	get my() { return this._owner === Game.me }
	get progressTotal() { return C.CONSTRUCTION_COST[this.structureType] }
	get _lookType() { return C.LOOK_CONSTRUCTION_SITES }
}

export function create(
	pos: RoomPosition,
	structureType: ConstructibleStructureType,
	name: string | null,
	owner: string,
) {
	return assign(RoomObject.create(new ConstructionSite, pos), {
		structureType,
		name: name ?? '',
		_owner: owner,
	});
}
