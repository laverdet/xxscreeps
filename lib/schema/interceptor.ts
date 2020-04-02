import type { BufferView } from './buffer-view';
import { getLayout, unpackHolderFormat, Format, FormatShape, StructFormat, WithShape } from './format';
import type { Layout, StructLayout } from './layout';
import { injectGetters } from './overlay';

// Interceptor types
type CompositionInterceptor<Layout = any, Type = any> = {
	compose: (value: Layout) => any;
	decompose: (value: Type) => Layout extends any[] ? Layout | Iterable<Layout[number]> : Layout;
};

type RawCompositionInterceptor<Type = any> = {
	composeFromBuffer: (view: BufferView, offset: number) => Type;
	decomposeIntoBuffer: (value: Type, view: BufferView, offset: number) => number;
};

type OverlayInterceptor = {
	overlay: { prototype: any };
};

type SymbolInterceptor = {
	symbol: string | symbol;
};

type MembersInterceptor = {
	members: Dictionary<MemberInterceptor>;
};

// Various combinations of interceptors
type ObjectInterceptor = CompositionInterceptor & RawCompositionInterceptor & OverlayInterceptor;
export type MemberInterceptor = Partial<ObjectInterceptor & SymbolInterceptor>;
type Interceptor = Partial<MembersInterceptor & ObjectInterceptor>;

// Needed to correctly save the type of symbols
export function withSymbol<Symbol extends symbol>(symbol: Symbol): { symbol: Symbol } {
	return { symbol };
}

// Formats and Layouts are casted to this and the symbol is used to attach interceptors
export const BoundInterceptor = Symbol('boundInterceptor');
export type WithBoundInterceptor = {
	[BoundInterceptor]?: {
		name?: string;
		interceptor?: Interceptor;
	};
};

// Interceptor lookup function used by getReader and getWriter
export type InterceptorLookup = (layout: Layout) => Interceptor | undefined;
export const defaultInterceptorLookup: InterceptorLookup = layout =>
	typeof layout === 'string' ? undefined : layout[BoundInterceptor]?.interceptor;

// Helpers to extract resulting data type from interceptors
type OverlayType<Type> = Type extends { prototype: any } ? Type['prototype'] : never;

type CompositionType<Type> =
	Type extends CompositionInterceptor ? ReturnType<Type['compose']> :
	Type extends RawCompositionInterceptor ? ReturnType<Type['composeFromBuffer']> :
	never;

// This maps { symbol: ... } interceptors to either the symbol or the member key if no symbol
// interceptor specified
export type MemberSymbolKeys<Type> = {
	[Key in keyof Type]: Type[Key] extends SymbolInterceptor ? Type[Key]['symbol'] : Key;
}[keyof Type];

// Returns the original key from `MemberSymbolKeys`
type MemberSymbolLookupKey<Type, Symbol> = Symbol extends keyof Type ? Symbol :
	{ [Key in keyof Type]: Type[Key] extends { symbol: Symbol } ? Key : never }[keyof Type];

// And this maps the symbol returned by `MemberSymbolKeys` back to the value it references
type MemberSymbolLookupValue<Type, Symbol> = Symbol extends keyof Type ? Type[Symbol] :
	{ [Key in keyof Type]: Type[Key] extends { symbol: Symbol } ? Type[Key] : never }[keyof Type];

// Create Shape information from Format and Interceptors
type ShapeForKey<Format extends StructFormat, Key> = FormatShape<Key extends keyof Format ? Format[Key] : never>;

type InterceptorResolvedMembersShape<Format extends StructFormat, Interceptors extends MembersInterceptor['members']> =
	Omit<FormatShape<Format>, keyof Interceptors> & {
		[Key in MemberSymbolKeys<Interceptors>]: CompositionType<MemberSymbolLookupValue<Interceptors, Key>> extends never ?
			ShapeForKey<Format, MemberSymbolLookupKey<Interceptors, Key>> :
			CompositionType<MemberSymbolLookupValue<Interceptors, Key>>;
	};

type InterceptorResolvedShape<Format extends StructFormat, Interceptors> =
	Interceptors extends OverlayInterceptor ? OverlayType<Interceptors['overlay']> :
	Interceptors extends MembersInterceptor ? InterceptorResolvedMembersShape<Format, Interceptors['members']> :
	never;

// compose / decompose or composeFromBuffer / decomposeIntoBuffer
export function bindInterceptors<Type extends Format, Result>(
	format: Type,
	interceptor: CompositionInterceptor<FormatShape<Type>, Result> | RawCompositionInterceptor<Result>,
): WithShape<Result>;

export function bindInterceptors<Type extends Format, Result>(
	name: string,
	format: Type,
	interceptor: CompositionInterceptor<FormatShape<Type>, Result> | RawCompositionInterceptor<Result>,
): WithShape<Result>;

// Overlay or member interceptor
export function bindInterceptors<Type extends StructFormat, InterceptorFormat extends Interceptor>(
	format: Type, interceptor: InterceptorFormat,
): WithShape<InterceptorResolvedShape<Type, InterceptorFormat>>;

export function bindInterceptors<Type extends StructFormat, InterceptorFormat extends Interceptor>(
	name: string, format: Type, interceptor: InterceptorFormat,
): WithShape<InterceptorResolvedShape<Type, InterceptorFormat>>;

export function bindInterceptors(...args: any[]): any {
	const { name, format, interceptor } = function() {
		if (args.length === 2) {
			return { format: args[0] as Format, interceptor: args[1] as Interceptor };
		} else {
			return { name: args[0] as string, format: args[1] as Format, interceptor: args[2] as Interceptor };
		}
	}();
	if (typeof format === 'string') {
		// Create a placeholder object for this format to distinguish it from others of the same type
		return bindInterceptors(name!, [ 'holder', format ] as any, interceptor);
	}

	// Combine interceptors with existing interceptors
	const withBound = format as WithBoundInterceptor;
	const bound = withBound[BoundInterceptor];
	const result = (bound ? [ 'holder', format ] : format) as WithBoundInterceptor;
	result[BoundInterceptor] = {
		name: name ?? bound?.name,
		interceptor: {
			...bound?.interceptor,
			...interceptor,
			members: {
				...bound?.interceptor?.members,
				...interceptor.members,
			},
		},
	};

	// Inject getters
	const { overlay } = interceptor as Partial<OverlayInterceptor>;
	if (overlay) {
		const layout = getLayout(unpackHolderFormat(format)) as StructLayout;
		injectGetters(layout, overlay.prototype, defaultInterceptorLookup);
	}

	return result;
}

// Just makes the archived output nicer
export function bindName<Type extends Exclude<Format, string>>(name: string, format: Type): WithShape<FormatShape<Type>> {
	(format as WithBoundInterceptor)[BoundInterceptor] = { name };
	return format as any;
}

// Injects types from format and interceptors into class prototype
export function withOverlay<Format extends WithShape>() {
	return <Type extends { prototype: object }>(classDeclaration: Type) =>
		classDeclaration as any as new (view: BufferView, offset: number) =>
			Type['prototype'] & FormatShape<Format>;
}
