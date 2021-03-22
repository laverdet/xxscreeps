import type { Implementation } from 'xxscreeps/utility/types';
import type { BufferView } from './buffer-view';
import { Variant } from '.';
export { Variant };

type WithVariant<V extends number | string = any> = { [Variant]: V };

// This is passed around as a fake type from all the declaration functions
const Type = Symbol('withType');
export type WithType<Type> = { [Type]: Type };
export type TypeOf<Format> =
	Format extends () => infer Type ? TypeOf<Type> :
	Format extends WithType<infer Type> ? Type :
	Format extends Numeric ? number :
	Format extends 'bool' ? boolean :
	Format extends 'buffer' ? Readonly<Uint8Array> :
	Format extends 'string' ? string :
	never;

export type Format =
	(() => Format) | WithType<any> | Primitive | ComposedFormat | NamedFormat |
	ArrayFormat | ConstantFormat | EnumFormat | OptionalFormat | StructFormat | VariantFormat | VectorFormat;
type Numeric = 'int8' | 'int16' | 'int32' | 'uint8' | 'uint16' | 'uint32' | 'double';
export type Primitive = Numeric | 'bool' | 'buffer' | 'string';

type ArrayFormat = {
	array: Format;
	length: number;
};

type ComposedFormat = {
	composed: Format;
	interceptor: Interceptor | Implementation;
};

export type ConstantFormat = {
	constant: any;
};

type EnumTypes = string | undefined;
export type EnumFormat = {
	enum: EnumTypes[];
};

type NamedFormat = {
	named: string;
	format: Format;
};

type OptionalFormat = {
	optional: Format;
};

type StructFormat = {
	struct: Record<string | symbol, Format>;
	inherit?: WithType<{}>;
	variant?: number | string;
};

type VariantFormat = {
	variant: StructFormat[];
};

type VectorFormat = {
	vector: Format;
};

// A fixed sized array of elements
export function array<Type extends Format>(length: number, element: Type): WithType<TypeOf<Type>[]> {
	const format: ArrayFormat = {
		array: element,
		length,
	};
	return format as never;
}

// Composed interceptor types
export type Interceptor = CompositionInterceptor | RawCompositionInterceptor;
type CompositionInterceptor<Type = any, Result = any> = {
	compose: (value: Type) => Result;
	decompose: (value: Result) => Type extends any[] ? Iterable<Type[number]> : Type;
};

type RawCompositionInterceptor<Type = any> = {
	composeFromBuffer: (view: BufferView, offset: number) => Type;
	decomposeIntoBuffer: (value: Type, view: BufferView, offset: number) => number;
};

export function compose<Type extends Format, In extends CompositionInterceptor<TypeOf<Type>>>(
	format: Type, interceptor: In,
): WithType<In extends CompositionInterceptor<TypeOf<Type>, infer Result> ? Result : never>;

export function compose<Type extends Format, Result>(
	format: Type, interceptor: RawCompositionInterceptor<Result>,
): WithType<Result>;

export function compose<Overlay>(format: Format, interceptor: Implementation<Overlay>): WithType<Overlay>;

export function compose(format: Format, interceptor: Interceptor | Implementation) {
	const composedFormat: ComposedFormat = {
		composed: format,
		interceptor,
	};
	return composedFormat as never;
}

// Holds a constant that doesn't even get stored into the blob
export function constant<Type extends number | string | {}>(value: Type): WithType<Type> {
	const format: ConstantFormat = { constant: value };
	return format as never;
}

// Adds a name to a format to allow reuse
export function declare<Type extends Format>(named: string, format: Type): Type {
	const namedFormat: NamedFormat = { named, format };
	return namedFormat as never;
}

// An indexed value from a defined set of possible values
export function enumerated<Type extends EnumTypes[]>(...values: Type): WithType<Type[number]> {
	if (values.length > 256) {
		throw new Error('`enumerated` type is too large');
	}
	const format: EnumFormat = {
		enum: values,
	};
	return format as never;
}

// An optional element, will consume only 1 byte in case of `undefined`
export function optional<Type extends Format>(element: Type): WithType<TypeOf<Type> | undefined> {
	const format: OptionalFormat = {
		optional: element,
	};
	return format as never;
}

// Structure / object type
type StructDeclaration = WithVariant | {
	[key: string]: Format;
};

export type StructDeclarationType<
	Type extends StructDeclaration,
	Keys extends keyof Type = Exclude<keyof Type, typeof Variant>,
	Reqs extends Keys = Keys extends any ?
		undefined extends TypeOf<Type[Keys]> ? never : Keys : never> =
{
	[Key in Keys]?: TypeOf<Type[Key]>;
} & {
	[Key in Reqs]: TypeOf<Type[Key]>;
} & (Type extends WithVariant<infer V> ? WithVariant<V> : unknown);

export function struct<Type extends StructDeclaration>(format: Type):
WithType<StructDeclarationType<Type>>;

export function struct<Base extends Format, Type extends StructDeclaration>(base: Base, format: Type):
WithType<TypeOf<Base> & StructDeclarationType<Type>>;

export function struct(...args: [ StructDeclaration ] | [ any, StructDeclaration ]) {
	const { inherit, members } = args.length === 1 ?
		{ inherit: undefined, members: args[0] } :
		{ inherit: args[0], members: args[1] };
	const format: StructFormat = {
		struct: members as any,
		inherit,
		variant: (members as any)[Variant],
	};
	return format as never;
}

// Pass a string to define a variant key into a `struct`
export function variant<V extends number | string>(name: V): WithVariant<V>;
// *or* an array of structs with variant keys
export function variant<Type extends Format[]>(...args: Type): WithType<{
	[Key in keyof Type]: TypeOf<Type[Key]>;
}[number]>;

export function variant(...args: [ string ] | StructFormat[]): any {
	if (args.length === 1 && typeof args[0] !== 'object') {
		return { [Variant]: args[0] };
	} else {
		const format: VariantFormat = {
			variant: args as StructFormat[],
		};
		return format;
	}
}

// An array of elements, of arbitrary size
export function vector<Type extends Format>(element: Type): WithType<TypeOf<Type>[]> {
	const Format: VectorFormat = {
		vector: element,
	};
	return Format as never;
}

// If a conditional type works itself out to WithType<never> this will provide a fallback
export function withFallback<Fallback>() {
	return <Type extends Format>(format: Type):
		Type extends WithType<never> ? WithType<Fallback> : Type => format as never;
}

// Cast the type of a format to something else
export function withType<Type>(format: Format): WithType<Type> {
	return format as never;
}
