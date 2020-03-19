import { makeVector } from '~/engine/schema/format';

export const format = {
	modules: makeVector({
		name: 'string' as const,
		data: 'string' as const,
	}),
/*	binaries: makeVector({
		name: 'string' as const,
		data: makeVector('uint8' as const),
	}),*/
};
