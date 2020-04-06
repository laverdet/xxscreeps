import { declare, getReader, getWriter, vector, TypeOf } from '~/lib/schema';
import { mapInPlace } from '~/lib/utility';

export const format = declare('CodeBranch', {
	modules: declare(vector({
		name: 'string',
		data: 'string',
	}), {
		compose: value => new Map<string, string>(value.map(entry => [ entry.name, entry.data ])),
		decompose: (value: Map<string, string>) => mapInPlace(value.entries(), ([ name, data ]) => ({ name, data })),
	}),
});

export const read = getReader(format);
export const write = getWriter(format);

export type UserCode = TypeOf<typeof format>;
export type Message = { type: 'eval'; expr: string } | { type: 'push'; id: string; name: string } | { type: null };
export type ConsoleMessage = { type: 'console'; log?: string; result?: string } | { type: null };
