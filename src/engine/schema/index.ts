import type { WithShape, WithType } from 'xxscreeps/schema/format';
import type { UnionToIntersection, UnwrapArray, WithKey } from 'xxscreeps/utility/types';
import { resolve } from 'xxscreeps/schema/layout';
import { entriesWithSymbols } from 'xxscreeps/schema/symbol';
import { getOrSet } from 'xxscreeps/utility/utility';

const schemaByPath = new Map<string, any[]>();

// Resolve mod formats from `declare module` interfaces
type AllFormatsByPath = UnwrapArray<Schema[keyof Schema]>;
type FormatForPath<Path extends string> = WithKey<Path> extends AllFormatsByPath ?
	Extract<AllFormatsByPath, WithKey<Path>>[Path] : unknown;
export interface Schema {}


// Returns augmented formats as array that can be spread into enumerated declarations
type ExtractEnumeratedSchema<Format> = Format extends WithType<infer Type> ? Type[] : never[];
export function enumeratedForPath<Path extends string>(path: Path): ExtractEnumeratedSchema<FormatForPath<Path>> {
	return (schemaByPath.get(path) ?? []).map(format => format.enum).flat() as never;
}

// Returns augmented formats as plain object that can be spread into a `struct({ ... })` declaration
type ExtractStructSchema<Format> = UnionToIntersection<Format extends WithShape<infer Type> ? {
	[Key in keyof Type]: WithShape<Type[Key]>;
} : {}> & UnionToIntersection<Format extends WithType<infer Type> ? {
	[Key in keyof Type]: WithType<Type[Key]>;
} : {}>;
export function structForPath<Path extends string>(path: Path): ExtractStructSchema<FormatForPath<Path>> {
	const schema = {} as any;
	const formats = schemaByPath.get(path) ?? [];
	for (const format of formats) {
		const resolvedFormat = resolve(format);
		for (const [ key, member ] of entriesWithSymbols(resolvedFormat.struct)) {
			schema[key] = member;
		}
	}
	return schema;
}

// Returns augmented formats as array that can be spread into variant declarations
type ExtractVariantSchema<Format> = Format extends {} ? Format : never;
export function variantForPath<Path extends string>(path: Path): ExtractVariantSchema<FormatForPath<Path>>[] {
	return (schemaByPath.get(path) ?? []) as never;
}

// Register a schema format for a given "path"
type UnwrapLateBind<Format> = Format extends () => infer Type ? Type : Format;
export function registerSchema<Path extends string, Type>(path: Path, format: Type):
{ [key in Path]: UnwrapLateBind<Type> } {
	getOrSet(schemaByPath, path, () => []).push(format);
	return undefined as never;
}
