import { declare, inherit, TypeOf } from 'xxscreeps/schema';
import * as Id from 'xxscreeps/engine/util/schema/id';
import { Structure } from 'xxscreeps/game/objects/structures';
import * as RoomObject from './room-object';

export type Shape = TypeOf<typeof shape>;
const shape = declare('Structure', {
	...inherit(RoomObject.format),
	hits: 'int32',
	_owner: Id.optionalFormat,
});

export const format = declare(shape, { overlay: Structure });
