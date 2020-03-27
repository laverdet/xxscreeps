import { checkCast, makeEnum, makeVector, withType, Format, Inherit, Interceptor, Variant } from '~/lib/schema';
import * as Id from '~/engine/util/id';
import * as C from '~/game/constants';
import { AgeTime, Creep } from '~/game/objects/creep';
import { Owner } from '~/game/objects/room-object';
import * as RoomObject from './room-object';
import * as Store from './store';

export { Creep };

export const bodyFormat = makeVector({
	boost: Store.resourceEnumFormat,
	hits: 'uint8',
	type: makeEnum(...C.BODYPARTS_ALL),
});

export const format = withType<Creep>(checkCast<Format>()({
	[Inherit]: RoomObject.format,
	[Variant]: 'creep',
	ageTime: 'int32',
	body: bodyFormat,
	fatigue: 'int16',
	hits: 'int16',
	name: 'string',
	owner: Id.format,
	// saying: ...
	store: Store.format,
}));

export const interceptors = {
	Creep: checkCast<Interceptor>()({
		overlay: Creep,
		members: {
			ageTime: { symbol: AgeTime },
			owner: { symbol: Owner, ...Id.interceptors },
		},
	}),
};

export const schemaFormat = { Creep: format };
