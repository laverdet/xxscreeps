import { checkCast, makeVector, withType, Format, FormatShape, Interceptor } from '~/lib/schema';
import * as Id from '~/engine/util/id';

export const format = checkCast<Format>()({
	id: Id.format,
	username: 'string',
	cpu: 'int32',
	gcl: 'int32',
	cpuAvailable: 'int32',
	registeredDate: 'int32',
	active: 'bool',
	badge: 'string',
	visibleRooms: withType<Set<string>>((makeVector('string'))),
});

export type User = FormatShape<typeof format>;

export const interceptors = checkCast<Interceptor>()({
	members: {
		id: Id.interceptors,
		visibleRooms: {
			compose: (roomNames: string[]) => new Set(roomNames),
			decompose: (roomNames: Set<string>) => roomNames.values(),
		},
	},
});
