import type { TypeOf } from 'xxscreeps/schema';
import * as Fn from 'xxscreeps/utility/functional';
import { compose, declare, struct, vector } from 'xxscreeps/schema';
import { makeReaderAndWriter } from 'xxscreeps/engine/schema';

export const format = declare('Code', struct({
	modules: compose(vector(struct({
		name: 'string',
		data: 'string',
	})), {
		compose: value => new Map<string, string>(value.map(entry => [ entry.name, entry.data ])),
		decompose: (value: Map<string, string>) => Fn.map(value.entries(), ([ name, data ]) => ({ name, data })),
	}),
}));

export const { read, write } = makeReaderAndWriter(format);

export type UserCode = TypeOf<typeof format>;
