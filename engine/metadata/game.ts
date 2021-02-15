import { declare, getReader, getWriter, TypeOf } from 'xxscreeps/schema';
import * as StringSet from 'xxscreeps/engine/util/schema/string-set';

const format = declare('Game', {
	time: 'int32',
	accessibleRooms: StringSet.format,
	activeRooms: StringSet.format,
	users: StringSet.format,
});
export type Type = TypeOf<typeof format>;

export const read = getReader(format);
export const write = getWriter(format);
