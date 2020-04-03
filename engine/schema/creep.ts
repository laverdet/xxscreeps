import { bindInterceptors, makeEnum, makeVector, withSymbol, Inherit, Variant } from '~/lib/schema';
import * as Id from '~/engine/util/schema/id';
import * as C from '~/game/constants';
import { AgeTime, Creep, Owner } from '~/game/objects/creep';
import * as RoomObject from './room-object';
import * as Store from './store';

export const shape = bindInterceptors('Creep', {
	[Inherit]: RoomObject.format,
	[Variant]: 'creep',
	ageTime: 'int32',
	body: makeVector({
		boost: Store.resourceEnumFormat,
		hits: 'uint8',
		type: makeEnum(...C.BODYPARTS_ALL),
	}),
	fatigue: 'int16',
	hits: 'int16',
	name: 'string',
	owner: Id.format,
	// saying: ...
	store: Store.format,
}, {
	members: {
		ageTime: withSymbol(AgeTime),
		owner: withSymbol(Owner),
	},
});

export const format = bindInterceptors(shape, { overlay: Creep });
