import { declare, enumerated, inherit, variant, withSymbol } from '~/lib/schema';
import * as Id from '~/engine/util/schema/id';
import * as C from '~/game/constants';
import { ConstructionSite, Name } from '~/game/objects/construction-site';
import { Owner } from '~/game/objects/room-object';
import * as RoomObject from './room-object';

export const shape = declare('ConstructionSite', {
	...inherit(RoomObject.format),
	...variant('constructionSite'),
	name: withSymbol(Name, 'string'),
	owner: withSymbol(Owner, Id.format),
	progress: 'int32',
	structureType: enumerated(...Object.keys(C.CONSTRUCTION_COST) as (keyof typeof C.CONSTRUCTION_COST)[]),
});

export const format = declare(shape, { overlay: ConstructionSite });
