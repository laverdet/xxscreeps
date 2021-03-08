import type { RoomPosition } from 'xxscreeps/game/position';
import * as C from 'xxscreeps/game/constants';
import * as Id from 'xxscreeps/engine/schema/id';
import * as Game from 'xxscreeps/game/game';
import * as RoomObject from 'xxscreeps/game/object';
import { compose, declare, enumerated, struct, variant, withOverlay } from 'xxscreeps/schema';
import { assign } from 'xxscreeps/util/utility';
import { structureFactories } from './symbols';

export type ConstructibleStructureType = keyof typeof C.CONSTRUCTION_COST;

export function format() { return compose(shape, ConstructionSite) }
const shape = () => declare('ConstructionSite', struct(RoomObject.format, {
	...variant('constructionSite'),
	name: 'string',
	progress: 'int32',
	structureType: enumerated(...structureFactories.keys() as never as ConstructibleStructureType[]),
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
	owner: string,
	name?: string | null,
) {
	return assign(RoomObject.create(new ConstructionSite, pos), {
		structureType,
		name: name ?? '',
		_owner: owner,
	});
}
