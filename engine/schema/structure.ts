import { checkCast, withType, Format, Inherit, Interceptor } from '~/lib/schema';
import * as Id from '~/engine/util/id';
import { Owner } from '~/game/objects/room-object';
import { Structure } from '~/game/objects/structures';
import * as RoomObject from './room-object';

export { Structure };

export const format = withType<Structure>(checkCast<Format>()({
	[Inherit]: RoomObject.format,
	hits: 'int32',
	owner: Id.format,
}));

export const interceptors = {
	Structure: checkCast<Interceptor>()({
		overlay: Structure,
		members: {
			owner: { symbol: Owner, ...Id.interceptors },
		},
	}),
};

export const schemaFormat = { Structure: format };
