import type { BufferObject } from './buffer-object';
import type { BufferView } from './buffer-view';

type CompositionInterceptor = {
	compose?: (value: any) => any;
	decompose?: (value: any) => any;
};

type RawCompositionInterceptor = {
	composeFromBuffer?: (view: BufferView, offset: number) => any;
	decomposeIntoBuffer?: (value: any, view: BufferView, offset: number) => number;
};

type OverlayInterceptor = {
	overlay?: { prototype: typeof BufferObject.prototype };
};

type SymbolInterceptor = {
	symbol?: symbol;
};

type MembersInterceptor = {
	members?: Dictionary<MemberInterceptor>;
};

type ObjectInterceptor = CompositionInterceptor & RawCompositionInterceptor & OverlayInterceptor;
export type MemberInterceptor = ObjectInterceptor & SymbolInterceptor;

export type Interceptor = ObjectInterceptor & MembersInterceptor;
export type InterceptorSchema = Record<string, Interceptor>;

export type BoundInterceptorSchema = WeakMap<object, Interceptor>;
export function bindInterceptorsToSchema(
	schema: Record<string, object>,
	interceptorSchema: InterceptorSchema,
): BoundInterceptorSchema {
	const map: BoundInterceptorSchema = new WeakMap();
	for (const [ key, interceptor ] of Object.entries(interceptorSchema)) {
		map.set(schema[key]!, interceptor);
	}
	return map;
}
