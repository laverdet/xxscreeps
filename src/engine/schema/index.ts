import type { struct, variant } from 'xxscreeps/schema/format';
import type { UnionToIntersection, UnwrapArray } from 'xxscreeps/utility/types';
import type { Format } from 'xxscreeps/schema';
import { Cache, makeReader, makeWriter } from 'xxscreeps/schema';
import { entriesWithSymbols } from 'xxscreeps/schema/symbol';
import { getOrSet } from 'xxscreeps/utility/utility';
// Use full path here so we can rewrite it in webpack
import { build } from 'xxscreeps/engine/schema/build';
export { build };

// Resolve mod formats from `declare module` interfaces
type FormatsForPath<Schema, Path extends string> =
	Extract<UnwrapArray<Schema[keyof Schema]>, { path: Path }> extends { format: infer Type } ? Type : never;

// Register schema extension
const schemaByPath = new Map<string, any[]>();
function registerSchema(path: string, ...format: any[]) {
	getOrSet(schemaByPath, path, () => []).push(...format);
	return undefined as never;
}

// Register enumerated types
export const registerEnumerated:
<Path extends string, Type extends (keyof any)[]>
(path: Path, ...format: Type) => { path: Path; format: Type } = registerSchema;

// Register struct members
export const registerStruct:
<Path extends string, Type extends Parameters<typeof struct>[1]>
(path: Path, format: Type) => { path: Path; format: Type } = registerSchema;

// Register variant types
export const registerVariant:
<Path extends string, Type extends Parameters<typeof variant>[number]>
(path: Path, format: Type) => { path: Path; format: Type } = registerSchema;

// Returns augmented formats as array that can be spread into enumerated declarations
type EnumeratedSchema<Type> = Type extends any[] ? Type[number] : never;
export function enumeratedForPath<Schema>() {
	return <Path extends string>(path: Path): EnumeratedSchema<FormatsForPath<Schema, Path>>[] => schemaByPath.get(path) ?? [];
}

// Returns augmented formats as plain object that can be spread into a `struct({ ... })` declaration
export function structForPath<Schema>() {
	return <Path extends string>(path: Path): UnionToIntersection<FormatsForPath<Schema, Path>> => {
		const schema: any = {};
		const formats = schemaByPath.get(path) ?? [];
		for (const format of formats) {
			for (const [ key, member ] of entriesWithSymbols(format)) {
				schema[key] = member;
			}
		}
		return schema;
	};
}

// Returns augmented formats as array that can be spread into variant declarations
type VariantSchema<Format> = Format extends {} ? Format : never;
export function variantForPath<Schema>() {
	return <Path extends string>(path: Path): VariantSchema<FormatsForPath<Schema, Path>>[] => schemaByPath.get(path) ?? [];
}

export function makeReaderAndWriter<Type extends Format>(format: Type) {
	const info = build(format);
	const cache = new Cache;
	return {
		read: makeReader(info, cache),
		write: makeWriter(info, cache),
	};
}
