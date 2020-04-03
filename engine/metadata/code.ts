import { bindInterceptors, makeVector, FormatType } from '~/lib/schema';

export const format = bindInterceptors('Code', {
	modules: makeVector({
		name: 'string',
		data: 'string',
	}),
/* binaries: makeVector({
		name: 'string',
		data: makeVector('uint8'),
	}),*/
}, {
	compose: value => new Map<string, string>(value.modules.map(entry => [ entry.name, entry.data ])),
	decompose: (value: Map<string, string>) => ({
		modules: [ ...value.entries() ].map(([ name, data ]) => ({ name, data })),
	}),
});

export type UserCode = FormatType<typeof format>;
