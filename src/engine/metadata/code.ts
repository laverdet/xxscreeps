import * as Fn from 'xxscreeps/utility/functional';
import { TypeOf, compose, makeReader, makeWriter, struct, vector } from 'xxscreeps/schema';

export const format = struct({
	modules: compose(vector(struct({
		name: 'string',
		data: 'string',
	})), {
		compose: value => new Map<string, string>(value.map(entry => [ entry.name, entry.data ])),
		decompose: (value: Map<string, string>) => Fn.map(value.entries(), ([ name, data ]) => ({ name, data })),
	}),
});

export const read = makeReader(format);
export const write = makeWriter(format);

export type UserCode = TypeOf<typeof format>;
export type ConsoleMessage = { type: 'console'; log?: string; result?: string } | { type: null };
