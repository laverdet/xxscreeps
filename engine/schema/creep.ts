import { declare, enumerated, inherit, variant, vector, withSymbol } from '~/lib/schema';
import * as Id from '~/engine/util/schema/id';
import * as C from '~/game/constants';
import { AgeTime, Creep, Owner } from '~/game/objects/creep';
import * as RoomObject from './room-object';
import * as Store from './store';

export const shape = declare('Creep', {
	...inherit(RoomObject.format),
	...variant('creep'),
	ageTime: withSymbol(AgeTime, 'int32'),
	body: vector({
		boost: Store.resourceEnumFormat,
		hits: 'uint8',
		type: enumerated(...C.BODYPARTS_ALL),
	}),
	fatigue: 'int16',
	hits: 'int16',
	name: 'string',
	owner: withSymbol(Owner, Id.format),
	// saying: ...
	store: Store.format,
});

export const format = declare(shape, { overlay: Creep });
