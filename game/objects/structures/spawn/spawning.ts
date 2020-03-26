import { checkCast, makeVector, Format, FormatShape, Interceptor } from '~/engine/schema';
import * as Id from '~/engine/util/id';

export const format = checkCast<Format>()({
	creep: Id.format,
	directions: makeVector('int8'),
	endTime: 'int32',
	needTime: 'int32',
});

export type Spawning = FormatShape<typeof format>;

export const interceptors = {
	Spawning: checkCast<Interceptor>()({
		members: { creep: Id.interceptors },
	}),
};

export const schemaFormat = { Spawning: format };
