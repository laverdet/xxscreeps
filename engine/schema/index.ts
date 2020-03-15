import type { Format } from './format';
import type { Layout, StructLayout } from './layout';
import type { BoundReadInterceptorSchema, ReadInterceptor, ReadInterceptorSchema } from './read';
import type { BoundWriteInterceptorSchema, WriteInterceptor, WriteInterceptorSchema } from './write';
export type { ReadInterceptors } from './read';
export type { WriteInterceptors } from './write';

export type SchemaFormat = {
	[key: string]: Format;
};

export type Schema = {
	[key: string]: Layout;
};

export function bindInterceptorsToSchema(schema: Schema, interceptors: ReadInterceptorSchema): BoundReadInterceptorSchema;
export function bindInterceptorsToSchema(schema: Schema, interceptors: WriteInterceptorSchema): BoundWriteInterceptorSchema;
export function bindInterceptorsToSchema(schema: Schema, interceptors: ReadInterceptorSchema | WriteInterceptorSchema) {
	const map = new WeakMap<object, any>();
	for (const [ key, interceptorsByKey ] of Object.entries(interceptors)) {
		map.set(schema[key] as any, interceptorsByKey);
	}
	return map;
}
