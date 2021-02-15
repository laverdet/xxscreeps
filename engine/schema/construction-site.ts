import { declare, enumerated, inherit, variant, TypeOf } from 'xxscreeps/schema';
import * as Id from 'xxscreeps/engine/util/schema/id';
import * as C from 'xxscreeps/game/constants';
import { ConstructionSite } from 'xxscreeps/game/objects/construction-site';
import * as RoomObject from './room-object';

export type Shape = TypeOf<typeof shape>;
const shape = declare('ConstructionSite', {
	...inherit(RoomObject.format),
	...variant('constructionSite'),
	name: 'string',
	progress: 'int32',
	structureType: enumerated(...Object.keys(C.CONSTRUCTION_COST) as (keyof typeof C.CONSTRUCTION_COST)[]),
	_owner: Id.format,
});

export const format = declare(shape, { overlay: ConstructionSite });
