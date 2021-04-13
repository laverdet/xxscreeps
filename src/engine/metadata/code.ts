import * as Fn from 'xxscreeps/utility/functional';
import { TypeOf, compose, makeReaderAndWriter, struct, vector } from 'xxscreeps/schema';

export const format = struct({
	modules: compose(vector(struct({
		name: 'string',
		data: 'string',
	})), {
		compose: value => new Map<string, string>(value.map(entry => [ entry.name, entry.data ])),
		decompose: (value: Map<string, string>) => Fn.map(value.entries(), ([ name, data ]) => ({ name, data })),
	}),
});

export const { read, write } = makeReaderAndWriter(format);

export type UserCode = TypeOf<typeof format>;
