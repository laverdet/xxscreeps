import { makeReaderAndWriter, struct, TypeOf } from 'xxscreeps/schema';
import * as StringSet from 'xxscreeps/engine/schema/string-set';

const format = struct({
	time: 'int32',
	rooms: StringSet.format,
	users: StringSet.format,
});
export type Type = TypeOf<typeof format>;

export const { read, write } = makeReaderAndWriter(format);
