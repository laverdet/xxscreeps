import { checkCast, makeVector, Format, FormatShape } from '~/engine/schema';

export const format = checkCast<Format>()({
	modules: makeVector({
		name: 'string',
		data: 'string',
	}),
/* binaries: makeVector({
		name: 'string',
		data: makeVector('uint8'),
	}),*/
});

export type UserCode = FormatShape<typeof format>;
