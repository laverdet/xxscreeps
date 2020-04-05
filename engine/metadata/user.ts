import { declare, getReader, getWriter, vector, TypeOf } from '~/lib/schema';
import * as StringSet from '~/engine/util/schema/string-set';
import * as Id from '~/engine/util/schema/id';

export const format = declare('User', {
	id: Id.format,
	username: 'string',
	cpu: 'int32',
	gcl: 'int32',
	cpuAvailable: 'int32',
	registeredDate: 'int32',
	active: 'bool',
	badge: 'string',
	visibleRooms: StringSet.format,
	code: {
		branch: Id.format,
		branches: vector({
			id: Id.format,
			name: 'string',
			timestamp: 'int32',
		}),
	},
});

export function create(username: string) {
	return {
		id: Id.generateId(12),
		username,
		cpu: 0,
		cpuAvailable: 0,
		gcl: 1,
		registeredDate: Date.now(),
		active: false,
		badge: '',
		visibleRooms: new Set<string>(),
		code: {
			branch: undefined,
			branches: [],
		},
	};
}

export type User = TypeOf<typeof format>;

export const read = getReader(format);
export const write = getWriter(format);
