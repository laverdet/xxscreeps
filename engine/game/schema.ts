import { getSchema, Format } from '~/engine/schema/format';
import { bindInterceptorsToSchema, Interceptors } from '~/engine/schema/interceptor';
import { StructLayout } from '~/engine/schema/layout';
import { injectGetters } from '~/engine/schema/overlay';
import * as Creep from './creep';
import * as RoomPosition from './position';
import * as Room from './room';
import * as RoomObject from './room-object';
import * as Source from './source';
import * as StructureSpawn from './structures/spawn';

const schemaObjects = {
	RoomPosition,
	RoomObject,
	Creep,
	Source,

	StructureSpawn,

	Room,
};

export const schemaFormat: {
	[name in keyof typeof schemaObjects]: typeof schemaObjects[name]['format'];
} = function(): any {
	const format: Dictionary<Format> = {};
	for (const [ name, imports ] of Object.entries(schemaObjects)) {
		format[name] = imports.format;
	}
	return format;
}();

export const schema = getSchema(schemaFormat);

export const interceptorSchema = bindInterceptorsToSchema(schema, function() {
	const interceptors: Dictionary<Interceptors> = {};
	for (const [ name, imports ] of Object.entries(schemaObjects)) {
		if ('interceptors' in imports) {
			interceptors[name] = imports.interceptors;
		}
	}
	return interceptors;
}());

export function finalizePrototypeGetters() {
	for (const [ name, imports ] of Object.entries(schemaObjects)) {
		injectGetters(
			(schema as Dictionary<StructLayout>)[name]!,
			(imports as any)[name]!.prototype,
			interceptorSchema);
	}
}
