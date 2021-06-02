import * as Fn from 'xxscreeps/utility/functional';
import { Builder, compose, declare, makeReader, makeWriter, struct, vector } from 'xxscreeps/schema';
import { build } from 'xxscreeps/engine/schema';

// Basic schema which stores code strings by name
const format = declare('Code', compose(vector(struct({
	name: 'string',
	data: 'string',
})), {
	compose: value => new Map<string, string>(value.map(entry => [ entry.name, entry.data ])),
	decompose: (value: Map<string, string>) => Fn.map(value.entries(), ([ name, data ]) => ({ name, data })),
}));
const schema = build(format);
const cache = new Builder;
export const read = makeReader(schema, cache);
export const write = makeWriter(schema, cache);
export type Code = ReturnType<typeof read>;
