import type { RoomPosition } from 'xxscreeps/game/position';
import * as C from 'xxscreeps/game/constants';
import * as Id from 'xxscreeps/engine/schema/id';
import * as Game from 'xxscreeps/game/game';
import * as RoomObject from 'xxscreeps/game/object';
import { compose, declare, enumerated, member, struct, variant, withOverlay } from 'xxscreeps/schema';
import { assign } from 'xxscreeps/utility/utility';
import { structureFactories } from './symbols';

export type ConstructibleStructureType = keyof typeof C.CONSTRUCTION_COST;

export function format() { return compose(shape, ConstructionSite) }
const shape = () => declare('ConstructionSite', struct(RoomObject.format, {
	...variant('constructionSite'),
	name: 'string',
	owner: member(RoomObject.Owner, Id.format),
	progress: 'int32',
	structureType: enumerated(...structureFactories.keys() as never as ConstructibleStructureType[]),
}));

export class ConstructionSite extends withOverlay(RoomObject.RoomObject, shape) {
	get my() { return this[RoomObject.Owner] === Game.me }
	get owner() { return this[RoomObject.Owner] }
	get progressTotal() { return C.CONSTRUCTION_COST[this.structureType] }
	get [RoomObject.LookType]() { return C.LOOK_CONSTRUCTION_SITES }
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
		[RoomObject.Owner]: owner,
	});
}
