import { makeReader, makeWriter, struct, TypeOf } from 'xxscreeps/schema';
import * as StringSet from 'xxscreeps/engine/util/schema/string-set';

const format = struct({
	time: 'int32',
	accessibleRooms: StringSet.format,
	activeRooms: StringSet.format,
	users: StringSet.format,
});
export type Type = TypeOf<typeof format>;

export const read = makeReader(format);
export const write = makeWriter(format);
