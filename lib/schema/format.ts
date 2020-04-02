import { RecursiveWeakMemoize } from '~/lib/memoize';
import { BoundInterceptor, WithBoundInterceptor } from './interceptor';
import { kPointerSize, alignTo, getTraits, Integral, Layout, Primitive, StructLayout, Traits } from './layout';

// Struct w/ inheritance
export const Inherit = Symbol('schemaInherit');
// Special key used to detect which instance of a variant an object belongs to
export const Variant = Symbol('schemaVariant');

// Only used to carry type information
export const Shape = Symbol('withShape');
export type WithShape<Type = any> = { [Shape]: Type };

export type Format = WithShape | Primitive | StructFormat;
export type StructFormat = {
	[Inherit]?: WithShape;
	[Variant]?: string;
	[key: string]: Format;
};

export type Shape<Format> =
	Format extends WithShape<infer Type> ? Type :
	Format extends Integral ? number :
	Format extends 'bool' ? boolean :
	Format extends 'string' ? string :
	Format extends StructFormat ? {
		[Key in Exclude<keyof Format, symbol>]: Shape<Format[Key]>;
	} :
	never;

// Override detected shape
export function withType<Type>(format: Format): WithShape<Type> {
	return format as any;
}

// Constructors for type formats
export function makeArray<Type extends Format>(length: number, format: Type): WithShape<Shape<Type>[]> {
	return [ 'array', length, format ] as any;
}

export function makeEnum<Type extends (undefined | string)[]>(...values: Type): WithShape<Type[number]> {
	return [ 'enum', values ] as any;
}

export function makeOptional<Type extends Format>(format: Type): WithShape<Shape<Type> | undefined> {
	return [ 'optional', format ] as any;
}

export function makeVariant<Type extends Format[]>(...format: Type): WithShape<Shape<Type[number]>> {
	return [ 'variant', format ] as any;
}

export function makeVector<Type extends Format>(format: Type): WithShape<Shape<Type>[]> {
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

				// Optionals
				case 'optional':
					return {
						optional: getLayout(format[1]),
					};

				// Primitive used to create an object so bindInterceptor can reference it
				case 'primitive':
					return {
						primitive: format[1],
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
				const baseLayout = getLayout(format[Inherit]!) as StructLayout;
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
