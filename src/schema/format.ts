import type { BufferView } from './buffer-view';
import { Variant } from '.';
import { resolve } from './layout';
export { Variant };

type WithVariant<V extends number | string = any> = { [Variant]: V };

// This is passed around as a fake type from all the declaration functions
const Shape = Symbol('withShape');
const Type = Symbol('withType');
export type WithShape<Type> = { [Shape]: Type };
export type WithType<Type> = { [Type]: Type };
export type WithShapeAndType<Shape, Type = Shape> = WithShape<Shape> & WithType<Type>;
type ResolvedShapeOf<Format> = Format extends WithShape<infer Type> ? Type : ResolvedTypeOrShapeCommon<Format>;
type ResolvedTypeOf<Format> = Format extends WithType<infer Type> ? Type : ResolvedTypeOrShapeCommon<Format>;
type ResolvedTypeOrShapeCommon<Format> =
	Format extends Numeric ? number :
	Format extends 'bool' ? boolean :
	Format extends 'buffer' ? Readonly<Uint8Array> :
	Format extends 'string' ? string :
	never;

export type ShapeOf<Format> =
	Format extends () => infer Type ? ResolvedShapeOf<Type> :
	ResolvedShapeOf<Format>;
export type TypeOf<Format> =
	Format extends () => infer Type ? ResolvedTypeOf<Type> :
	ResolvedTypeOf<Format>;

type ResolvedFormat =
	WithType<any> | Primitive | ComposedFormat | NamedFormat |
	ArrayFormat | ConstantFormat | EnumFormat | OptionalFormat | StructFormat | VariantFormat | VectorFormat;
export type Format = (() => ResolvedFormat) | ResolvedFormat;
type Numeric = 'int8' | 'int16' | 'int32' | 'uint8' | 'uint16' | 'uint32' | 'double';
export type Primitive = Numeric | 'bool' | 'buffer' | 'string';

type ArrayFormat = {
	array: Format;
	length: number;
};

type ComposedFormat = {
	composed: Format;
	interceptor: Interceptor;
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
	struct: Record<string | symbol, Format> | Record<string, UnionDeclaration>;
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
export function array<Type extends Format>(length: number, element: Type):
WithShapeAndType<ShapeOf<Type>[], TypeOf<Type>[]> {
	const format: ArrayFormat = {
		array: element,
		length,
	};
	return format as never;
}

// Composed interceptor types
export type Interceptor = CompositionInterceptor | RawCompositionInterceptor | OverlayInterceptor;
type OverlayInterceptor<Type = unknown> = abstract new(view: BufferView, offset: number) => Type;
type CompositionInterceptor<Type = any, Result = any> = {
	compose: (value: Type) => Result;
	decompose: (value: Result) => Type extends any[] ? Iterable<Type[number]> : Type;
	kaitai?: any[];
};

type RawCompositionInterceptor<Type = any> = {
	composeFromBuffer: (view: BufferView, offset: number) => Type;
	decomposeIntoBuffer: (value: Type, view: BufferView, offset: number) => void;
	kaitai?: any[];
};

export function compose<Type extends Format, In extends CompositionInterceptor<TypeOf<Type>>>(
	format: Type, interceptor: In
): WithShapeAndType<In extends CompositionInterceptor<TypeOf<Type>, infer Result> ? Result : never>;

export function compose<Type extends Format, Result>(
	format: Type, interceptor: RawCompositionInterceptor<Result>
): WithShapeAndType<Result>;

export function compose<Type extends Format, Overlay>(format: Type, interceptor: OverlayInterceptor<Overlay>):
WithShapeAndType<ShapeOf<Type>, Overlay>;

export function compose(format: Format, interceptor: Interceptor) {
	const composedFormat: ComposedFormat = {
		composed: format,
		interceptor,
	};
	return composedFormat as never;
}

// Holds a constant that doesn't even get stored into the blob
export function constant<Type extends number | string | {}>(value: Type): WithShapeAndType<any, Type> {
	const format: ConstantFormat = { constant: value };
	return format as never;
}

// Adds a name to a format to allow reuse
export function declare<Type extends Format>(named: string, format: Type): Type {
	const namedFormat: NamedFormat = { named, format };
	return namedFormat as never;
}

// An indexed value from a defined set of possible values
export function enumerated<Type extends EnumTypes[]>(...values: Type): WithShapeAndType<Type[number]> {
	if (values.length > 256) {
		throw new Error('`enumerated` type is too large');
	}
	const format: EnumFormat = {
		enum: values,
	};
	return format as never;
}

// An optional element, will consume only 1 byte in case of `undefined`
export function optional<Type extends Format>(element: Type):
WithShapeAndType<ShapeOf<Type> | undefined, TypeOf<Type> | undefined> {
	const format: OptionalFormat = {
		optional: element,
	};
	return format as never;
}

// Structure / object type
export type StructDeclaration = WithVariant | Record<string, Format | UnionDeclaration>;

type StructDeclarationShape<
	Type extends StructDeclaration,
	Keys extends keyof Type = Exclude<keyof Type, typeof Variant>,
> = {
	[Key in Keys]: ShapeOf<Type[Key] extends UnionDeclaration<any, infer Format> ? Format : Type[Key]>;
} & (Type extends WithVariant<infer V> ? WithVariant<V> : unknown);

type StructDeclarationType<
	Type extends StructDeclaration,
	Keys extends keyof Type = Exclude<keyof Type, typeof Variant>,
> = {
	[Key in Keys]: TypeOf<Type[Key] extends UnionDeclaration<any, infer Format> ? Format : Type[Key]>;
} & (Type extends WithVariant<infer V> ? WithVariant<V> : unknown);

export function struct<Type extends StructDeclaration>(format: Type):
WithShapeAndType<StructDeclarationShape<Type>, StructDeclarationType<Type>>;

export function struct<Base extends Format, Type extends StructDeclaration>(base: Base, format: Type):
WithShapeAndType<ShapeOf<Base> & StructDeclarationShape<Type>, TypeOf<Base> & StructDeclarationType<Type>>;

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

export type UnionDeclaration<Key extends string = string, Type extends Format = Format> = {
	union: Record<Key, Type>;
};

export function union<Key extends string, Type extends Format>(format: Record<Key, Type>): UnionDeclaration<Key, Type> {
	return { union: format };
}

// Pass a string to define a variant key into a `struct`
export function variant<V extends number | string>(name: V): WithVariant<V>;
// *or* an array of structs with variant keys
export function variant<Type extends Format[]>(...args: Type): WithShapeAndType<{
	[Key in keyof Type]: ShapeOf<Type[Key]>;
}[number], {
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
export function vector<Type extends Format>(element: Type): WithShapeAndType<Iterable<ShapeOf<Type>>, TypeOf<Type>[]> {
	const Format: VectorFormat = {
		vector: element,
	};
	return Format as never;
}

// Cast the type of a format to something else
export function withType<Type>(format: Format): WithShapeAndType<Type> {
	return format as never;
}

// Get the name of a `declare`d format
export function getName(format: Format) {
	const resolved = resolve(format);
	if (typeof resolved === 'object' && 'named' in resolved) {
		return resolved.named;
	} else {
		return null;
	}
}
