import { checkCast, makeVector, withType, Format, Interceptor } from '~/engine/schema';
import * as User from './user';

export const format = checkCast<Format>()({
	time: 'int32',
	accessibleRooms: withType<Set<string>>(makeVector('string')),
	activeRooms: withType<Set<string>>(makeVector('string')),
	users: makeVector(User.format),
});

export const interceptors = checkCast<Interceptor>()({
	members: {
		accessibleRooms: {
			compose: (roomNames: string[]) => new Set(roomNames),
			decompose: (roomNames: Set<string>) => roomNames.values(),
		},
		activeRooms: {
			compose: (roomNames: string[]) => new Set(roomNames),
			decompose: (roomNames: Set<string>) => roomNames.values(),
		},
	},
});
