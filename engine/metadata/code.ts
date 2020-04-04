import { bindName, bindInterceptors, getReader, getWriter, makeVector, FormatType } from '~/lib/schema';

export const format = bindName('CodeBranch', {
	modules: bindInterceptors(makeVector({
		name: 'string',
		data: 'string',
	}), {
		compose: value => new Map<string, string>(value.map(entry => [ entry.name, entry.data ])),
		decompose: (value: Map<string, string>) => [ ...value.entries() ].map(([ name, data ]) => ({ name, data })),
	}),
	timeCreated: 'int32',
	timeModified: 'int32',
});

export const read = getReader(format);
export const write = getWriter(format);

export type UserCode = FormatType<typeof format>;
