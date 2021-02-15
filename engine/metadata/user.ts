import { declare, getReader, getWriter, vector, TypeOf } from 'xxscreeps/schema';
import * as StringSet from 'xxscreeps/engine/util/schema/string-set';
import * as Id from 'xxscreeps/engine/util/schema/id';

export const format = declare('User', {
	id: Id.format,
	username: 'string',
	cpu: 'int32',
	gcl: 'int32',
	cpuAvailable: 'int32',
	registeredDate: 'int32',
	active: 'bool',
	badge: 'string',
	roomsControlled: StringSet.format,
	roomsPresent: StringSet.format,
	roomsVisible: StringSet.format,
	code: {
		branch: Id.format,
		branches: vector({
			id: Id.format,
			name: 'string',
			timestamp: 'int32',
		}),
	},
});

export function create(username: string, id?: string) {
	return {
		id: id ?? Id.generateId(12),
		username,
		cpu: 100,
		cpuAvailable: 100,
		gcl: 1,
		registeredDate: Date.now(),
		active: false,
		badge: '',
		roomsControlled: new Set<string>(),
		roomsPresent: new Set<string>(),
		roomsVisible: new Set<string>(),
		code: {
			branch: undefined as any as string,
			branches: [],
		},
	};
}

export type User = TypeOf<typeof format>;

export const read = getReader(format);
export const write = getWriter(format);
