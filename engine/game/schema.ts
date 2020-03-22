import { getSchema } from '~/engine/schema/format';
import { bindInterceptorsToSchema } from '~/engine/schema/interceptor';
import { injectGetters } from '~/engine/schema/overlay';
import * as Creep from './creep';
import * as RoomPosition from './position';
import * as Room from './room';
import * as RoomObject from './room-object';
import * as Source from './source';
import * as Store from './store';
import * as Structure from './structure';
import * as StructureController from './structure/controller';
import * as StructureSpawn from './structure/spawn';

const schemaObjects = {
	RoomPosition,
	RoomObject,
	Store,

	Creep,
	Source,

	Structure,
	StructureController,
	StructureSpawn,

	Room,
};

const schemaFormat = function() {
	const format: any = {};
	for (const [ name, imports ] of Object.entries(schemaObjects)) {
		format[name] = imports.format;
	}
	return format as {
		[name in keyof typeof schemaObjects]: typeof schemaObjects[name]['format']
	};
}();

export const schema = getSchema(schemaFormat);

export const interceptorSchema = bindInterceptorsToSchema(schema, function() {
	const interceptors: any = {};
	for (const [ name, imports ] of Object.entries(schemaObjects)) {
		if ('interceptors' in imports) {
			interceptors[name] = imports.interceptors;
		}
	}
	return interceptors as {
		[name in keyof typeof schemaObjects]: typeof schemaObjects[name]['interceptors']
	};
}());

export function finalizePrototypeGetters() {
	for (const [ name, imports ] of Object.entries(schemaObjects)) {
		injectGetters(
			(schema as any)[name],
			(imports as any)[name].prototype,
			interceptorSchema);
	}
}
