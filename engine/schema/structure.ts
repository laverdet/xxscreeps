import { declare, inherit } from '~/lib/schema';
import * as Id from '~/engine/util/schema/id';
import { Structure } from '~/game/objects/structures';
import * as RoomObject from './room-object';

export const shape = declare('Structure', {
	...inherit(RoomObject.format),
	hits: 'int32',
	_owner: Id.format,
});

export const format = declare(shape, { overlay: Structure });
