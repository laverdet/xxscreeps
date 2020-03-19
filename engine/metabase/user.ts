import { Interceptors } from '~/engine/schema/interceptor';
import * as Id from '~/engine/util/id';

export const format = {
	id: Id.format,
	username: 'string' as const,
	cpu: 'int32' as const,
	gcl: 'int32' as const,
	cpuAvailable: 'int32' as const,
	registeredDate: 'int32' as const,
	active: 'int8' as const,
	badge: 'string' as const,
};

export const interceptors: Interceptors = {
	members: { id: Id.interceptors },
};
