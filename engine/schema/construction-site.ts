import { checkCast, makeEnum, withType, Format, Inherit, Interceptor, Variant } from '~/lib/schema';
import * as Id from '~/engine/util/id';
import * as C from '~/game/constants';
import { ConstructionSite, Name } from '~/game/objects/construction-site';
import { Owner } from '~/game/objects/room-object';
import * as RoomObject from './room-object';

export { ConstructionSite };

export const structureTypeEnumFormat = makeEnum(
	...Object.keys(C.CONSTRUCTION_COST) as (keyof typeof C.CONSTRUCTION_COST)[],
);

export const format = withType<ConstructionSite>(checkCast<Format>()({
	[Inherit]: RoomObject.format,
	[Variant]: 'constructionSite',
	name: 'string',
	owner: Id.format,
	progress: 'int32',
	structureType: structureTypeEnumFormat,
}));

export const interceptors = {
	ConstructionSite: checkCast<Interceptor>()({
		members: {
			name: { symbol: Name },
			owner: { symbol: Owner, ...Id.interceptors },
		},
		overlay: ConstructionSite,
	}),
};

export const schemaFormat = { ConstructionSite: format };
