import { declare, getReader, getWriter, TypeOf } from '~/lib/schema';
import * as StringSet from '~/engine/util/schema/string-set';

const format = declare('Game', {
	time: 'int32',
	accessibleRooms: StringSet.format,
	activeRooms: StringSet.format,
	users: StringSet.format,
});
export type Type = TypeOf<typeof format>;

export const read = getReader(format);
export const write = getWriter(format);
