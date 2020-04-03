import { RecursiveWeakMemoize } from '~/lib/memoize';
import { BoundInterceptor, WithBoundInterceptor } from './interceptor';
import { kPointerSize, alignTo, getTraits, Integral, Layout, Primitive, StructLayout, Traits } from './layout';

// Struct w/ inheritance
export const Inherit = Symbol('schemaInherit');
// Special key used to detect which instance of a variant an object belongs to
export const Variant = Symbol('schemaVariant');

// Only used to carry type information
export const Shape = Symbol('withShape');
export type WithShape<Shape = any> = { [Shape]: Shape };
export const Type = Symbol('withType');
export type WithType<Type = any> = { [Type]: Type };
export type WithShapeAndType<Type> = WithShape<Type> & WithType<Type>;

export type Format = WithShape | WithType | Primitive | StructFormat;
export type StructFormat = {
	[Inherit]?: WithType;
	[Variant]?: string;
	[key: string]: Format;
};

type CommonShape<Format> =
	Format extends Integral ? number :
	Format extends 'bool' ? boolean :
	Format extends 'string' ? string :
	never;

export type FormatShape<Format> =
	Format extends WithShape<infer Type> ? Type :
	Format extends StructFormat ? {
		[Key in Exclude<keyof Format, symbol>]: FormatShape<Format[Key]>;
	} & (Format[typeof Inherit] extends WithShape<infer Type> ? Type : unknown) :
	CommonShape<Format>;

export type FormatType<Format> =
	Format extends WithType<infer Type> ? Type :
	Format extends StructFormat ? {
		[Key in Exclude<keyof Format, symbol>]: FormatType<Format[Key]>;
	} :
	CommonShape<Format>;

// Override detected shape
export function withType<Type>(format: Format): WithShapeAndType<Type> {
	return format as any;
}

// Recursively unpacks holder formats created by bindInterceptor
export function unpackHolderFormat(format: Format) {
	let unpacked: any = format;
	while (unpacked[0] === 'holder') {
		// eslint-disable-next-line prefer-destructuring
		unpacked = unpacked[1];
	}
	return unpacked;
}

// Constructors for type formats
export function makeArray<Type extends Format>(length: number, format: Type):
WithShapeAndType<FormatType<Type>[]> {
	return [ 'array', length, format ] as any;
}

export function makeEnum<Type extends (undefined | string)[]>(...values: Type):
WithShapeAndType<Type[number]> {
	return [ 'enum', values ] as any;
}

export function makeOptional<Type extends Format>(format: Type):
WithShape<FormatType<Type> | undefined> & WithType<FormatType<Type> | undefined> {
	return [ 'optional', format ] as any;
}

export function makeVariant<Type extends Format[]>(...format: Type):
WithShape<FormatShape<Type[number]>> & WithType<FormatType<Type[number]>> {
	return [ 'variant', format ] as any;
}

export function makeVector<Type extends Format>(format: Type):
WithShape<Iterable<FormatShape<Type>>> & WithType<FormatType<Type>[]> {
	return [ 'vector', format ] as any;
}

// Layouts are memoized to prevent duplication of readers/writers and base classes
const getBoundLayout = RecursiveWeakMemoize([ 0 ], (format: any): Layout => {
	const layout = function(): Exclude<Layout, Primitive> {
		if (Array.isArray(format)) {
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

				// Holder for another type so bindInterceptor can reference it
				case 'holder':
					return {
						holder: getLayout(format[1]),
					};

				// Optionals
				case 'optional':
					return {
						optional: getLayout(format[1]),
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

				default:
					throw TypeError(`Invalid format specifier: ${format[0]}`);
			}

		} else {
			// Structures

			// Fetch memory layout for each member
			type WithTraits = { traits: Traits };
			const members: (WithTraits & { key: string; layout: Layout })[] = [];
			for (const [ key, memberFormat ] of Object.entries(format)) {
				const layout = getLayout(memberFormat as Format);
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
				const baseLayout = getLayout(unpackHolderFormat(format[Inherit]!)) as StructLayout;
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
				layout['variant!'] = format[Variant];
			}
			return layout;
		}
	}();

	// Forward bound interceptor
	layout[BoundInterceptor] = (format as WithBoundInterceptor)[BoundInterceptor];
	return layout;
});

export function getLayout(format: Format): Layout {
	if (typeof format === 'string') {
		// Plain primitive types
		return format;
	}
	return getBoundLayout(format);
}
