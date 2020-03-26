import { checkCast, makeVector, withType, Format, Interceptor } from '~/lib/schema';
import { mapInPlace } from '~/lib/utility';
import * as User from './user';

export const format = checkCast<Format>()({
	time: 'int32',
	accessibleRooms: withType<Set<string>>(makeVector('string')),
	activeRooms: withType<Set<string>>(makeVector('string')),
	users: withType<Map<string, User.User>>(makeVector(User.format)),
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
		users: {
			compose: (users: User.User[]) => new Map(mapInPlace(users, (user): [ string, User.User ] => [ user.id, user ])),
			decompose: (users: Map<string, User.User>) => users.values(),
		},
	},
});
