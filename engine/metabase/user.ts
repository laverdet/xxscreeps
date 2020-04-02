import { bindInterceptors, makeVector, withType, Shape } from '~/lib/schema';
import * as Id from '~/engine/util/id';

export const format = bindInterceptors('User', {
	id: Id.format,
	username: 'string',
	cpu: 'int32',
	gcl: 'int32',
	cpuAvailable: 'int32',
	registeredDate: 'int32',
	active: 'bool',
	badge: 'string',
	visibleRooms: withType<Set<string>>((makeVector('string'))),
}, {
	members: {
		visibleRooms: {
			compose: (roomNames: string[]) => new Set(roomNames),
			decompose: (roomNames: Set<string>) => roomNames.values(),
		},
	},
});

export type User = Shape<typeof format>;
