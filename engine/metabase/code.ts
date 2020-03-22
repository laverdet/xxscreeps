import { checkCast, makeVector, Format } from '~/engine/schema';

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
