import { bindInterceptors, withSymbol, Inherit } from '~/lib/schema';
import * as Id from '~/engine/util/id';
import { Owner } from '~/game/objects/room-object';
import { Structure } from '~/game/objects/structures';
import * as RoomObject from './room-object';

export const shape = bindInterceptors('Structure', {
	[Inherit]: RoomObject.format,
	hits: 'int32',
	owner: Id.format,
}, {
	members: {
		owner: withSymbol(Owner),
	},
});

export const format = bindInterceptors(shape, { overlay: Structure });
