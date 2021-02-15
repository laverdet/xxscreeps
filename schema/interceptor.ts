import type { BufferView } from './buffer-view';
import type { ShapeOf, TypeOf, WithShapeAndType } from './format';
import type { Layout } from './layout';

// Interceptor types
type CompositionInterceptor<Shape = any, Type = any, Result = any> = {
	compose: (value: Type) => Result;
	decompose: (value: Result) => Shape | (Shape extends any[] ? Iterable<Shape[number]> : never);
};

type RawCompositionInterceptor<Type = any> = {
	composeFromBuffer: (view: BufferView, offset: number) => Type;
	decomposeIntoBuffer: (value: Type, view: BufferView, offset: number) => number;
};

type OverlayInterceptor<Type = any> = {
	overlay: { prototype: Type };
};

export type Interceptor<Format = any> =
	CompositionInterceptor<ShapeOf<Format>, TypeOf<Format>> |
	RawCompositionInterceptor |
	OverlayInterceptor;

export type InterceptorResult<Format, In extends Interceptor> =
	In extends CompositionInterceptor<ShapeOf<Format>, TypeOf<Format>, infer Type> ? WithShapeAndType<Type> :
	In extends RawCompositionInterceptor<infer Type> ? WithShapeAndType<Type> :
	In extends OverlayInterceptor<infer Type> ? WithShapeAndType<ShapeOf<Format>, Type> :
	never;

// Interceptors bound to format or layout
export const FormatName = Symbol('formatName');
export const BoundInterceptor = Symbol('schemaInterceptor');
export const BoundSymbol = Symbol('schemaSymbol');
export type BoundSchema = {
	[FormatName]?: string;
	[BoundInterceptor]?: Interceptor;
	[BoundSymbol]?: string | symbol;
};
export type WithSymbol<Symbol extends string | symbol> = { [BoundSymbol]: Symbol };

// Interceptor lookup function used by getReader and getWriter
export type InterceptorLookup = typeof defaultInterceptorLookup;
export const defaultInterceptorLookup = {
	interceptor: (layout: Layout) => recursiveLookup(layout, BoundInterceptor),
	name: (layout: Layout) => recursiveLookup(layout, FormatName),
	symbol: (layout: Layout) => recursiveLookup(layout, BoundSymbol),
};

function recursiveLookup(layout: Layout, symbol: typeof BoundInterceptor): UnionToIntersection<Interceptor> | undefined;
function recursiveLookup(layout: Layout, symbol: typeof BoundSymbol): string | symbol | undefined;
function recursiveLookup(layout: Layout, symbol: typeof FormatName): string | undefined;
function recursiveLookup(layout: Layout, symbol: keyof Layout): any {
	if (typeof layout !== 'string') {
		if (layout[symbol] !== undefined) {
			return layout[symbol];
		}
		if ('holder' in layout) {
			return recursiveLookup(layout.holder, symbol);
		}
	}
}
