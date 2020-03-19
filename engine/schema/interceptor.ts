import type { Schema } from '.';
import type { BufferObject } from './buffer-object';
import type { BufferView } from './buffer-view';
import type { StructLayout } from './layout';

type CompositionInterceptor = {
	compose?: (value: any) => any;
	decompose?: (value: any) => any;
};

type RawCompositionInterceptor = {
	composeFromBuffer?: (view: BufferView, offset: number) => any;
	decomposeIntoBuffer?: (value: any, view: BufferView, offset: number) => number;
};

type OverlayInterceptor = {
	overlay?: Constructor<BufferObject>;
};

type SymbolInterceptor = {
	symbol?: symbol;
};

type ObjectInterceptor = CompositionInterceptor & RawCompositionInterceptor & OverlayInterceptor;
export type MemberInterceptor = ObjectInterceptor & SymbolInterceptor;

export type Interceptors = ObjectInterceptor & {
	members?: Dictionary<MemberInterceptor>;
};
export type InterceptorSchema = Dictionary<Interceptors>;
export type BoundInterceptorSchema = WeakMap<StructLayout, Interceptors>;

export function bindInterceptorsToSchema(schema: Schema, interceptorSchema: InterceptorSchema): BoundInterceptorSchema {
	const map = new WeakMap();
	for (const [ key, interceptor ] of Object.entries(interceptorSchema)) {
		map.set(schema[key] as any, interceptor);
	}
	return map;
}
