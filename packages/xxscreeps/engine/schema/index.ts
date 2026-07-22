import type { StructDeclaration, StructFormat, TypeOf, UnionDeclaration, variant } from 'xxscreeps/schema/format.js';
import type { BuilderOptions, Format } from 'xxscreeps/schema/index.js';
import type { ReadOptions } from 'xxscreeps/schema/read.js';
import type { UnionToIntersection, UnwrapArray } from 'xxscreeps/utility/types.js';
import { ownEntriesIncludingPrivate } from 'xxscreeps/driver/private/runtime.js';
import { build, makeUpgrader } from 'xxscreeps/engine/schema/build/index.js';
import { Builder, makeReader, makeWriter } from 'xxscreeps/schema/index.js';
import { makeOffsetOf } from 'xxscreeps/schema/read.js';
import { getOrSet } from 'xxscreeps/utility/utility.js';
// Use full path here so we can rewrite it in webpack
export { build, makeUpgrader };

// Resolve mod formats from `declare module` interfaces
type FormatsForPath<Schema, Path extends string> =
	Extract<UnwrapArray<Schema[keyof Schema]>, { path: Path }> extends { format: infer Type } ? Type : never;

/**
 * Composable overlay extension for types like `Creep` and `StructureTerminal` which have multiple
 * schema hooks.
 */
export type WithOverlay<Schema> = StructDeclarationMembers<UnionToIntersection<FormatsForPath<Schema, string>>>;

type StructDeclarationMembers<Type> = {
	[Key in keyof Type]: TypeOf<Type[Key] extends UnionDeclaration<any, infer Format> ? Format : Type[Key]>;
};

// Schema which can be extend by mods using the given path
export interface SchemaByPath<Path extends string, Format> {
	path: Path;
	format: Format;
}

// Register schema extension
const schemaByPath = new Map<string, unknown[]>();
const closedSchemaByPath = new Set<string>();
function registerSchema(path: string, ...format: unknown[]) {
	if (closedSchemaByPath.has(path)) {
		throw new Error(`Schema for path ${path} has already been closed`);
	}
	getOrSet(schemaByPath, path, () => []).push(...format);
	return undefined as never;
}

// Register enumerated types
export const registerEnumerated:
	<Path extends string, Type extends (string | number)[]>
	(path: Path, ...format: Type) => { path: Path; format: Type } = registerSchema;

// Register struct members
export const registerStruct:
	<Path extends string, Struct extends StructDeclaration>
	(path: Path, format: Struct) => SchemaByPath<Path, Struct> = registerSchema;

// Register variant types
export const registerVariant:
	<Path extends string, Type extends Parameters<typeof variant>[number]>
	(path: Path, format: Type) => { path: Path; format: Type } = registerSchema;

// Returns augmented formats as array that can be spread into enumerated declarations
export function enumeratedForPath<Schema extends string>() {
	return <Path extends string>(path: Path): `${Schema}`[] => {
		closedSchemaByPath.add(path);
		return (schemaByPath.get(path) ?? []) as never;
	};
}

// Returns augmented formats as plain object that can be spread into a `struct({ ... })` declaration
interface StructForPath<Schema> {
	<Path extends string, Format extends StructDeclaration>(
		path: Path, format: Format
	): [ format: UnionToIntersection<FormatsForPath<Schema, Path>> & Format ];
	<Path extends string, Inherit, Format extends StructDeclaration>(
		path: Path, inherit: Inherit, format: Format
	): [ inherit: Inherit, format: UnionToIntersection<FormatsForPath<Schema, Path>> & Format ];
}
export function structForPath<Schema>(): StructForPath<Schema> {
	return (
		path: string,
		...args:
			[ members: StructDeclaration ] |
			[ inherit: Format, members: StructDeclaration ]
	) => {
		closedSchemaByPath.add(path);
		const [ inherit, members ] = args.length === 1 ? [ undefined, args[0] ] : args;
		const struct = members satisfies StructDeclaration as StructFormat['struct'];
		const formats = schemaByPath.get(path) ?? [];
		for (const format of formats) {
			for (const [ key, member ] of ownEntriesIncludingPrivate(format as UnionToIntersection<StructDeclaration>)) {
				struct[key] = member;
			}
		}
		if (inherit === undefined) {
			return [ struct ] as never;
		} else {
			return [ inherit, struct ] as never;
		}
	};
}

// Returns augmented formats as array that can be spread into variant declarations
type VariantSchema<Format> = Format extends any ? Format : never;
export function variantForPath<Schema>() {
	return <Path extends string>(path: Path): VariantSchema<FormatsForPath<Schema, Path>>[] => {
		closedSchemaByPath.add(path);
		return (schemaByPath.get(path) ?? []) as never;
	};
}

export function makeReaderAndWriter<Type extends Format>(format: Type, options?: BuilderOptions & ReadOptions) {
	const info = build(format);
	const builder = new Builder(options);
	const write = makeWriter(info, builder);
	return {
		offsetOf: makeOffsetOf(info),
		read: makeReader(info, builder, options),
		version: info.version,
		write,
		upgrade: makeUpgrader(info, write),
	};
}
