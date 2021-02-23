import { RecursiveWeakMemoize } from 'xxscreeps/util/memoize';
import { defaultInterceptorLookup, BoundInterceptor, BoundSchema, BoundSymbol, FormatName, Interceptor, InterceptorResult, WithSymbol } from './interceptor';
import { kPointerSize, alignTo, getTraits, Integral, Layout, Primitive, StructLayout, Traits } from './layout';
import { injectGetters } from './overlay';

// Struct w/ inheritance
const Inherit = Symbol('schemaInherit');
type WithInherit<Type> = { [Inherit]: Type };

// Special key used to detect which instance of a variant an object belongs to
export const Variant = Symbol('schemaVariant');

// A format describes the initial general types of data then is enriched with type information from
// interceptors and eventually converted to layouts
export type Format = WithShape | WithType | Primitive | StructFormat;
type StructFormat = {
	[Inherit]?: WithType;
	[Variant]?: string;
	[key: string]: Format;
};

// Internal format descriptors
type EnumTypes = string | undefined;
type Definition =
	Primitive |
	[ 'array', number, Definition ] |
	[ 'enum', EnumTypes[] ] |
	[ 'holder', Definition ] |
	[ 'optional', Definition ] |
	[ 'variant', StructFormat[] ] |
	[ 'vector', Definition ] |
	StructFormat;

// Only used to carry type information
const Shape = Symbol('withShape');
type WithShape<Shape = any> = { [Shape]: Shape };
const Type = Symbol('withType');
export type WithType<Type = any> = { [Type]: Type };
export type WithShapeAndType<Shape, Type = Shape> = WithShape<Shape> & WithType<Type>;

// Extracts shape & type information from a format
type CommonShape<Format> =
	Format extends Integral ? number :
	Format extends 'bool' ? boolean :
	Format extends 'buffer' ? Readonly<Uint8Array> :
	Format extends 'string' ? string :
	never;

export type ShapeOf<Format> =
	Format extends WithShape<infer Type> ? Type :
	Format extends StructFormat ? {
		[Key in StructKeys<Format>]: ShapeOf<StructLookup<Format, Key>>;
	} & (Format extends WithInherit<WithShape<infer Type>> ? Type : unknown) :
	CommonShape<Format>;

export type TypeOf<Format> =
	Format extends WithType<infer Type> ? Type :
	Format extends StructFormat ? {
		[Key in StructKeys<Format>]: TypeOf<StructLookup<Format, Key>>;
	} & (Format extends WithInherit<WithType<infer Type>> ? Type : unknown) :
	CommonShape<Format>;

// Returns keys for a given struct format, accepting symbol interceptors
type StructKeys<Type extends StructFormat> = {
	[Key in keyof Type]: Key extends number ? never :
		Type[Key] extends WithSymbol<infer Symbol> ? Symbol : Key;
}[Exclude<keyof Type, symbol>];

// Looks up a symbol into a struct format and returns the value/format for that symbol
type StructLookup<Type extends StructFormat, Symbol extends string | symbol> =
	Symbol extends keyof Type ? Type[Symbol] :
	{ [Key in keyof Type]: Type[Key] extends WithSymbol<Symbol> ? Type[Key] : never }[keyof Type];

type DeclareOverloads =
	[ Definition ] |
	[ string, Definition ] |
	[ Definition, Interceptor | symbol ] |
	[ string | undefined, Definition, Interceptor | symbol | string ];

export function declare<Type extends Format>(format: Type):
WithShapeAndType<ShapeOf<Type>, TypeOf<Type>>;
export function declare<Type extends Format>(name: string, format: Type):
WithShapeAndType<ShapeOf<Type>, TypeOf<Type>>;

export function declare<Type extends Format, In extends Interceptor<Type>>(format: Type, interceptors: In):
InterceptorResult<Type, In>;
export function declare<Type extends Format, In extends Interceptor<Type>>(name: string | undefined, format: Type, interceptors: In):
InterceptorResult<Type, In>;

export function declare<Type extends Format, Symbol extends symbol>(format: Type, symbol: Symbol):
WithShapeAndType<ShapeOf<Type>, TypeOf<Type>> & WithSymbol<Symbol>;
export function declare<Type extends Format, Symbol extends string | symbol>(name: string | undefined, format: Type, symbol: Symbol):
WithShapeAndType<ShapeOf<Type>, TypeOf<Type>> & WithSymbol<Symbol>;

export function declare(...args: DeclareOverloads) {
	// Extract argument overloads
	const { name, format, interceptor, symbol } = function() {
		if (args.length === 1) {
			return { format: args[0] };
		} else if (args.length === 2) {
			if (typeof args[0] === 'string') {
				return { name: args[0], format: args[1] as Definition };
			} else {
				return { format: args[0], interceptor: args[1] as Interceptor };
			}
		} else {
			const { interceptor, symbol } =
				(typeof args[2] === 'string' || typeof args[2] === 'symbol') ?
					{ interceptor: undefined, symbol: args[2] } :
					{ interceptor: args[2], symbol: undefined };
			return { name: args[0], format: args[1], interceptor, symbol };
		}
	}();

	// Inject name & interceptor
	if (name !== undefined || interceptor || symbol !== undefined) {

		// Create new holder
		const holder: BoundSchema & [ 'holder', Definition ] = [ 'holder', format ];
		if (name !== undefined) {
			holder[FormatName] = name;
		}
		if (interceptor) {
			holder[BoundInterceptor] = interceptor;
		}
		if (symbol !== undefined) {
			holder[BoundSymbol] = symbol;
		}

		// Inject prototype getters into overlay
		if (interceptor && 'overlay' in interceptor) {
			const layout = getLayout(unpackHolderFormat(format) as StructFormat);
			injectGetters(layout, interceptor.overlay.prototype, defaultInterceptorLookup);
		}

		return holder;
	}

	// Plain format
	return format;
}

// Convenience wrapper for member symbol interceptor
export function withSymbol<Type extends Format, Symbol extends string | symbol>(symbol: Symbol, format: Type) {
	return declare(undefined, format, symbol);
}

// Override detected shape
export function withType<Type>(format: Format): WithShapeAndType<Type> {
	return format as any;
}

// Recursively unpacks holder formats
function unpackHolderFormat(format: Definition) {
	let unpacked: any = format;
	while (unpacked[0] === 'holder') {
		// eslint-disable-next-line prefer-destructuring
		unpacked = unpacked[1];
	}
	return unpacked;
}

// Spread creators for structs
export function inherit<Base extends StructFormat>(base: Base) {
	return { [Inherit]: base };
}

// Constructors for type formats
export function array<Type extends Format>(length: number, format: Type):
WithShapeAndType<ShapeOf<Type>[], TypeOf<Type>[]> {
	return [ 'array', length, format ] as any;
}

export function enumerated<Type extends EnumTypes[]>(...values: Type):
WithShapeAndType<Type[number]> {
	return [ 'enum', values ] as any;
}

export function optional<Type extends Format>(format: Type):
WithShapeAndType<ShapeOf<Type> | undefined, TypeOf<Type> | undefined> {
	return [ 'optional', format ] as any;
}

export function variant(name: string): { [Variant]: string };
export function variant<Type extends Exclude<Format, Primitive>[]>(...format: Type):
WithShapeAndType<ShapeOf<Type[number]>, TypeOf<Type[number]>>;
export function variant(...format: any) {
	if (format.length === 1 && typeof format[0] === 'string') {
		return { [Variant]: format[0] };
	} else {
		return [ 'variant', format ] as any;
	}
}

export function vector<Type extends Format>(format: Type):
WithShapeAndType<Iterable<ShapeOf<Type>>, TypeOf<Type>[]> {
	return [ 'vector', format ] as any;
}

// Layouts are memoized to prevent duplication of readers/writers and base classes
const getBoundLayout = RecursiveWeakMemoize([ 0 ], (format: BoundSchema & Exclude<Definition, Primitive>): Layout => {
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

				// Holder for another type
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
						variant: format[1].map(getLayout) as StructLayout[],
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
				const baseLayout = getLayout(format[Inherit]!);
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
	if (BoundInterceptor in format) {
		layout[BoundInterceptor] = format[BoundInterceptor];
	}
	if (BoundSymbol in format) {
		layout[BoundSymbol] = format[BoundSymbol];
	}
	if (FormatName in format) {
		layout[FormatName] = format[FormatName];
	}
	return layout;
});

export function getLayout(format: StructFormat): StructLayout;
export function getLayout(format: Definition): Layout;
export function getLayout(format: Definition): Layout {
	if (typeof format === 'string') {
		// Plain primitive types
		return format;
	}
	return getBoundLayout(format);
}
