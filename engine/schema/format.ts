import { RecursiveWeakMemoize } from '~/lib/memoize';
import type { Schema, SchemaFormat } from '.';
import { kPointerSize, alignTo, getTraits, Integral, Layout, Primitive, StructLayout, Traits } from './layout';

// Special key used to detect which instance of a variant an object belongs to
export const Variant: unique symbol = Symbol('schemaVariant');

// Format used to specify basic fields and types. `getLayout` will generate a stable binary layout
// from this information.
type ArrayFormat = [ 'array', number, Format ];
type InheritFormat = [ 'inherit', StructFormat, StructFormat ];
type StructFormat = {
	[Variant]?: string;
	[key: string]: Format;
};
type VariantFormat = [ 'variant', (
	(StructFormat & { [Variant]: string }) |
	(InheritFormat & [ 'inherit', any, { [Variant]: string } ])
)[] ];
type VectorFormat = [ 'vector', Format ];

export type Format = ArrayFormat | Primitive | InheritFormat | StructFormat | VariantFormat | VectorFormat;

// Generates types for `getLayout`
type ArrayFormatToLayout<Type extends ArrayFormat> = [ 'array', number, FormatToLayout<Type[2]> ];
type VariantFormatToLayout<Type extends VariantFormat> = [ 'variant', FormatToLayout<Type[1][number]> ];
type VectorFormatToLayout<Type extends VectorFormat> = [ 'vector', FormatToLayout<Type[1]> ];
type StructFormatToLayout<Type extends StructFormat> = {
	[Key in keyof Type]: {
		layout: FormatToLayout<Type[Key]>;
		offset: number;
		pointer?: true;
	};
};
type FormatToLayout<Type extends Format> =
	Type extends Primitive ? Type :
	Type extends ArrayFormat ? ArrayFormatToLayout<Type> :
	Type extends VariantFormat ? VariantFormatToLayout<Type> :
	Type extends VectorFormat ? VectorFormatToLayout<Type> :
	Type extends StructFormat ? StructFormatToLayout<Type> :
	never;

// These types are mostly useless. They describe the underlying data structure which ends up being
// way different than what the code sees once you throw in interceptors.
type ArrayShape<Type extends ArrayFormat> = Shape<Type[2]>[];
type InheritShape<Type extends InheritFormat> = StructShape<Type[1]> & StructShape<Type[2]>;
type VariantShape<Type extends VariantFormat> = VariantElementShape<Type[1][number]>;
type VariantElementShape<Type extends Format> =
	Type extends InheritFormat ? InheritShape<Type> :
	Type extends StructFormat ? StructShape<Type> : never;
type VectorShape<Type extends VectorFormat> = Shape<Type[1]>[];
type StructShape<Type extends StructFormat> = {
	[Key in keyof Type]: Shape<Type[Key]>;
};
export type Shape<Type extends Format> =
	Type extends Integral ? number :
	Type extends 'string' ? string :
	Type extends ArrayFormat ? ArrayShape<Type> :
	Type extends InheritFormat ? InheritShape<Type> :
	Type extends VariantFormat ? VariantShape<Type> :
	Type extends VectorFormat ? VectorShape<Type> :
	Type extends StructFormat ? StructShape<Type> : never;

export function makeArray<Type extends Format>(length: number, format: Type):
		[ 'array', number, Type ] {
	return [ 'array', length, format ];
}

export function makeInherit<Base extends StructFormat, Extension extends StructFormat>(
	base: Base, extension: Extension,
): [ 'inherit', Base, Extension ] {
	return [ 'inherit', base, extension ];
}

export function makeVariant<Type extends Format[]>(...format: Type):
		[ 'variant', Type ] {
	return [ 'variant', format ];
}

export function makeVector<Type extends Format>(format: Type):
		[ 'vector', Type ] {
	return [ 'vector', format ];
}

// Struct layouts are memoized to ensure that `inherit` layouts don't duplicate the base class
const getStructLayout = RecursiveWeakMemoize([ 0 ], (format: StructFormat, startOffset = 0): StructLayout => {

	// Fetch memory layout for each member
	type WithTraits = { traits: Traits };
	const members: (WithTraits & { key: string; layout: Layout })[] = [];
	for (const [ key, memberFormat ] of Object.entries(format)) {
		const layout = getLayout(memberFormat);
		members.push({
			key,
			layout,
			traits: getTraits(layout),
		});
	}

	// Simple struct pack algorithm by sorting by size largest to smallest
	const isPointer = (member: WithTraits) => member.traits.stride === undefined;
	members.sort((left, right) => {
		const size = (member: WithTraits) => isPointer(member) ? kPointerSize : member.traits.size;
		const elementSize = (member: WithTraits) => isPointer(member) ? member.traits.size : Infinity;
		return (
			// eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
			size(right) - size(left) ||
			elementSize(right) - elementSize(left) ||
			left.key.localeCompare(right.key)
		);
	});

	// Build layout
	const layout: StructLayout = { struct: {} };
	let offset = startOffset;
	for (const member of members) {
		const pointer = isPointer(member);
		offset = alignTo(offset, pointer ? kPointerSize : member.traits.align);
		layout.struct[member.key] = {
			layout: member.layout,
			offset,
			...pointer && { pointer: true as const },
		};
		offset += pointer ? kPointerSize : member.traits.size;
	}

	// Variant type defined?
	if (format[Variant] !== undefined) {
		layout[Variant] = format[Variant];
	}

	return layout;
});

// This crashes TypeScript =o
// function getLayout<Type extends Format>(format: Type): FormatToLayout<Type>;
function getLayout(format: Format): Layout;
function getLayout(format: InheritFormat | StructFormat): StructLayout;
function getLayout(format: Format): Layout {
	if (typeof format === 'string') {
		// Primitive types
		return format;

	} else if (Array.isArray(format)) {
		switch (format[0]) {
			// Arrays (fixed size)
			case 'array':
				return {
					array: getLayout(format[2]),
					size: format[1],
				};

			// Variant
			case 'variant':
				return {
					variant: format[1].map(getLayout),
				};

			// Vectors (dynamic size)
			case 'vector':
				return {
					vector: getLayout(format[1]),
				};

			// Struct inheritance
			case 'inherit': {
				const baseLayout = getStructLayout(format[1]);
				const layout = getStructLayout(format[2], getTraits(baseLayout).size);
				layout.inherit = baseLayout;
				return layout;
			}

			default:
				throw TypeError(`Invalid format specifier: ${format[0]}`);
		}

	} else {
		// Structures
		return getStructLayout(format);
	}
}

export function getSchema<Type extends SchemaFormat>(schemaFormat: Type): {
	[Key in keyof Type]: Layout;
};
export function getSchema(schemaFormat: SchemaFormat): Schema {
	const schema: Schema = {};
	for (const [ key, format ] of Object.entries(schemaFormat)) {
		schema[key] = getLayout(format);
	}
	return schema;
}
