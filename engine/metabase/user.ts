import { checkCast, Format, Interceptor } from '~/engine/schema';
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
});

export const interceptors = checkCast<Interceptor>()({
	members: { id: Id.interceptors },
});
