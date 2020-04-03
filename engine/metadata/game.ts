import { bindName, getReader, getWriter } from '~/lib/schema';
import * as StringSet from '~/engine/util/schema/string-set';

const format = bindName('Game', {
	time: 'int32',
	accessibleRooms: StringSet.format,
	activeRooms: StringSet.format,
	users: StringSet.format,
});

export const readGame = getReader(format);
export const writeGame = getWriter(format);
