import { declare, makeReader, makeWriter, struct, vector, TypeOf } from 'xxscreeps/schema';
import * as StringSet from 'xxscreeps/engine/schema/string-set';
import * as Id from 'xxscreeps/engine/schema/id';

export const format = declare('User', struct({
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
	code: struct({
		branch: Id.optionalFormat,
		branches: vector(struct({
			id: Id.format,
			name: 'string',
			timestamp: 'int32',
		})),
	}),
}));

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
			branch: null,
			branches: [],
		},
	};
}

export type User = TypeOf<typeof format>;

export const read = makeReader(format);
export const write = makeWriter(format);
