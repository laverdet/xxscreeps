import type { Schema } from '.';
import type { BufferView } from './buffer-view';
import type { StructLayout } from './layout';

type CompositionInterceptor = {
	compose: (value: any) => any;
	decompose: (value: any) => any;
	composeFromBuffer?: never;
	decomposeIntoBuffer?: never;
	symbol?: any;
};

type RawCompositionInterceptor = {
	compose?: never;
	decompose?: never;
	composeFromBuffer: (view: BufferView, offset: number) => any;
	decomposeIntoBuffer: (value: any, view: BufferView, offset: number) => number;
	symbol?: any;
};

type SymbolInterceptor = {
	compose?: any;
	decompose?: any;
	composeFromBuffer?: any;
	decomposeIntoBuffer?: any;
	symbol: symbol;
};

type ObjectInterceptor = CompositionInterceptor | RawCompositionInterceptor;
export type MemberInterceptor = ObjectInterceptor | SymbolInterceptor;

export type Interceptors = {
	instance: ObjectInterceptor;
	members?: undefined;
} | {
	instance?: undefined;
	members: Dictionary<MemberInterceptor>;
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
