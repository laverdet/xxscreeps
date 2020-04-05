import { declare, inherit, withSymbol } from '~/lib/schema';
import * as Id from '~/engine/util/schema/id';
import { Owner } from '~/game/objects/room-object';
import { Structure } from '~/game/objects/structures';
import * as RoomObject from './room-object';

export const shape = declare('Structure', {
	...inherit(RoomObject.format),
	hits: 'int32',
	owner: withSymbol(Owner, Id.format),
});

export const format = declare(shape, { overlay: Structure });
