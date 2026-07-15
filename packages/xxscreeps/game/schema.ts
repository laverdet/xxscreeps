import * as Id from 'xxscreeps/engine/schema/id.js';
import { enumeratedForPath } from 'xxscreeps/engine/schema/index.js';
import { RoomPosition } from 'xxscreeps/game/position.js';
import { compose, declare, enumerated, struct, union, vector } from 'xxscreeps/schema/index.js';

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface ActionLogSchema {}

export const roomPositionFormat = declare('RoomPosition', compose('int32', {
	compose: pos => RoomPosition['#create'](pos),
	decompose: (pos: RoomPosition) => pos['#id'],
	kaitai: [ {
		id: 'rx',
		type: 'u1',
	}, {
		id: 'ry',
		type: 'u1',
	}, {
		id: 'x',
		type: 's1',
	}, {
		id: 'y',
		type: 's1',
	} ],
}));

export const roomObjectShape = declare('RoomObject', struct({
	/**
	 * A unique object identificator. You can use
	 * [`Game.getObjectById`](https://docs.screeps.com/api/#Game.getObjectById) method to retrieve an
	 * object instance by its `id`.
	 * @public
	 */
	id: Id.format,

	/**
	 * An object representing the position of this object in the room.
	 * @public
	 * @see https://docs.screeps.com/api/#RoomObject.pos
	 */
	pos: roomPositionFormat,
	'#posId': union({ pos: 'int32' }),
}));

export const actionLogFormat = declare('ActionLog', () => vector(struct({
	type: enumerated(...enumeratedForPath<ActionLogSchema>()('ActionLog.action')),
	x: 'int8',
	y: 'int8',
	time: 'int32',
})));
