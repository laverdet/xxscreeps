import type { Schema, SchemaFormat } from '.';
import { kPointerSize, alignTo, getTraits, Layout, Primitive, StructLayout, Traits } from './layout';

// Format used to specify basic fields and types. `getLayout` will generate a stable binary layout
// from this information.
type ArrayFormat = [ 'array', number, Format ];
type VectorFormat = [ 'vector', Format ];

type StructFormat = {
	[key: string]: Format;
};
type InheritFormat = [ 'inherit', StructFormat, StructFormat ];

export type Format = Primitive | StructFormat | InheritFormat | ArrayFormat | VectorFormat;

// Generates types for `getLayout`
type ArrayFormatToLayout<Type extends ArrayFormat> = [ 'array', number, FormatToLayout<Type[2]> ];
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
	Type extends VectorFormat ? VectorFormatToLayout<Type> :
	Type extends StructFormat ? StructFormatToLayout<Type> :
	never;

export function makeArray<Type extends Format>(length: number, format: Type):
		[ 'array', number, Type ] {
	return [ 'array', length, format ];
}

export function makeInherit<Base extends StructFormat, Extension extends StructFormat>(
	base: Base, extension: Extension,
): [ 'inherit', Base, Extension ] {
	return [ 'inherit', base, extension ];
}

export function makeVector<Type extends Format>(format: Type):
		[ 'vector', Type ] {
	return [ 'vector', format ];
}

// Struct layouts are saved to ensure that `inherit` layouts don't duplicate the base class
const savedStructLayouts = new WeakMap<StructFormat, StructLayout>();
function getStructLayout(format: StructFormat, startOffset = 0): StructLayout {
	// Check existing layouts.
	const existingLayout = savedStructLayouts.get(format);
	if (existingLayout !== undefined) {
		return existingLayout;
	}

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
	savedStructLayouts.set(format, layout);
	return layout;
}

// This crashes TypeScript =o
// function getLayout<Type extends Format>(format: Type): FormatToLayout<Type>;
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
