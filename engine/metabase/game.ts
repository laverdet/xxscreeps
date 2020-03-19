import { makeVector } from '~/engine/schema/format';
import { Interceptors } from '~/engine/schema/interceptor';
import * as User from './user';

export const format = {
	time: 'int32' as const,
	accessibleRooms: makeVector('string' as const),
	activeRooms: makeVector('string' as const),
	users: makeVector(User.format),
};

export const interceptors: Interceptors = {
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
};
