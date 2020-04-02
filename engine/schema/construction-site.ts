import { bindInterceptors, makeEnum, withSymbol, Inherit, Variant } from '~/lib/schema';
import * as Id from '~/engine/util/id';
import * as C from '~/game/constants';
import { ConstructionSite, Name } from '~/game/objects/construction-site';
import { Owner } from '~/game/objects/room-object';
import * as RoomObject from './room-object';

export const shape = bindInterceptors('ConstructionSite', {
	[Inherit]: RoomObject.format,
	[Variant]: 'constructionSite',
	name: 'string',
	owner: Id.format,
	progress: 'int32',
	structureType: makeEnum(...Object.keys(C.CONSTRUCTION_COST) as (keyof typeof C.CONSTRUCTION_COST)[]),
}, {
	members: {
		name: withSymbol(Name),
		owner: withSymbol(Owner),
	},
});

export const format = bindInterceptors(shape, { overlay: ConstructionSite });
