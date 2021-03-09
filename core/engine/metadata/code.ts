import { TypeOf, compose, makeReader, makeWriter, struct, vector } from 'xxscreeps/schema';
import { mapInPlace } from 'xxscreeps/utility/utility';

export const format = struct({
	modules: compose(vector(struct({
		name: 'string',
		data: 'string',
	})), {
		compose: value => new Map<string, string>(value.map(entry => [ entry.name, entry.data ])),
		decompose: (value: Map<string, string>) => mapInPlace(value.entries(), ([ name, data ]) => ({ name, data })),
	}),
});

export const read = makeReader(format);
export const write = makeWriter(format);

export type UserCode = TypeOf<typeof format>;
export type ConsoleMessage = { type: 'console'; log?: string; result?: string } | { type: null };
