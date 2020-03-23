import { RecursiveWeakMemoize } from '~/lib/memoize';
import { kPointerSize, alignTo, getTraits, Integral, Layout, Primitive, StructLayout, Traits } from './layout';

// Struct w/ inheritance
export const Inherit: unique symbol = Symbol('schemaInherit');
// Special key used to detect which instance of a variant an object belongs to
export const Variant: unique symbol = Symbol('schemaVariant');

// Format used to specify basic fields and types. `getLayout` will generate a stable binary layout
// from this information.
type ArrayFormat = [ 'array', number, Format ];
type EnumFormat = [ 'enum', any[] ];
type OptionalFormat = [ 'optional', Format ];
type VectorFormat = [ 'vector', Format ];
type VariantFormat = [ 'variant', ((StructFormat | TypedFormat) & WithVariant)[] ];
type StructFormat = {
	[Inherit]?: StructFormat | TypedFormat;
	[Variant]?: string;
	[key: string]: Format;
};
type TypedFormat = [ 'typed', any ]; // Doesn't actually exist
type WithVariant = { [Variant]: string };

export type Format =
	ArrayFormat | EnumFormat | OptionalFormat | Primitive | StructFormat |
	TypedFormat | (TypedFormat & WithVariant) | VariantFormat | VectorFormat;

// Types which convert format to data
type ArrayShape<Type extends ArrayFormat> = FormatShape<Type[2]>[];
type EnumShape<Type extends EnumFormat> = Type[1][number];
type OptionalShape<Type extends OptionalFormat> = Type[1] | undefined;
type VariantShapeHelp<Type> = Type extends StructFormat ? StructShape<Type> :
	Type extends TypedFormat ? Type[1] : never;
type VariantShape<Type extends VariantFormat> = VariantShapeHelp<Type[1][number]>;
type VectorShape<Type extends VectorFormat> = FormatShape<Type[1]>[];

type StructMemberShape<Type extends StructFormat> = {
	[Key in Exclude<keyof Type, symbol>]: FormatShape<Type[Key]>;
};

// Uhh I guess don't go more than four layers deep lmao
type StructShape<Type extends StructFormat> = StructMemberShape<Type> & StructShape2<Type[typeof Inherit]>;
type StructShape2<Type> = Type extends StructFormat ? StructMemberShape<Type> & StructShape3<Type[typeof Inherit]> : unknown;
type StructShape3<Type> = Type extends StructFormat ? StructMemberShape<Type> & StructShape4<Type[typeof Inherit]> : unknown;
type StructShape4<Type> = Type extends StructFormat ? StructMemberShape<Type> : unknown;

export type FormatShape<Type extends Format> =
	Type extends Integral ? number :
	Type extends 'string' ? string :
	Type extends ArrayFormat ? ArrayShape<Type> :
	Type extends EnumFormat ? EnumShape<Type> :
	Type extends OptionalFormat ? OptionalShape<Type> :
	Type extends TypedFormat ? Type[1] :
	Type extends VariantFormat ? VariantShape<Type> :
	Type extends VectorFormat ? VectorShape<Type> :
	Type extends StructFormat ? StructShape<Type> : never;

// Constructors for type formats
export function makeArray<Type extends Format>(length: number, format: Type): [ 'array', number, Type ] {
	return [ 'array', length, format ];
}

export function makeEnum<Type extends any[]>(...values: Type): [ 'enum', Type ] {
	return [ 'enum', values ];
}

export function makeOptional<Type extends Format>(format: Type): [ 'optional', Type ] {
	return [ 'optional', format ];
}

export function makeVariant<Type extends WithVariant[]>(...format: Type): [ 'variant', Type ] {
	return [ 'variant', format ];
}

export function makeVector<Type extends Format>(format: Type): [ 'vector', Type ] {
	return [ 'vector', format ];
}

// Used to annotate an interceptor will change the type of this format
export function withType<Type extends WithVariant>(format: Format & WithVariant): [ 'typed', Type ] & WithVariant;
export function withType<Type>(format: Format): [ 'typed', Type ];
export function withType(format: Format): any {
	return format as any;
}

// Struct layouts are memoized to ensure that `inherit` layouts don't duplicate the base class
const getStructLayout = RecursiveWeakMemoize([ 0 ], (format: StructFormat): StructLayout => {

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

	// Initialize layout
	const layout: StructLayout = { struct: {} };
	let offset = 0;
	if (format[Inherit] !== undefined) {
		const baseLayout = getStructLayout(format[Inherit] as StructFormat);
		layout.inherit = baseLayout;
		offset = getTraits(baseLayout).size;
	}

	// Arrange member layout
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

function getLayout(format: StructFormat): StructLayout;
function getLayout(format: Format): Layout;
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

			// Enums
			case 'enum':
				return {
					enum: format[1],
				};

			// Optionals
			case 'optional':
				return {
					optional: getLayout(format[1]),
				};

			// Variant
			case 'variant':
				return {
					variant: format[1].map(getLayout as (format: StructFormat | TypedFormat) => StructLayout),
				};

			// Vectors (dynamic size)
			case 'vector':
				return {
					vector: getLayout(format[1]),
				};

			default:
				throw TypeError(`Invalid format specifier: ${format[0]}`);
		}

	} else {
		// Structures
		return getStructLayout(format);
	}
}

// These types are an outright *lie*. We map straight from format -> data here to keep the compiler
// happy
export function getSchema<Type extends Record<string, Format>>(schemaFormat: Type): {
	[Key in keyof Type]: FormatShape<Type[Key]>;
};
export function getSchema(schemaFormat: Dictionary<any>): any {
	const schema: Dictionary<Layout> = {};
	for (const [ key, format ] of Object.entries(schemaFormat)) {
		schema[key] = getLayout(format);
	}
	return schema;
}
