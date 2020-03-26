import { getReader, getSchema } from '~/engine/schema';
import { bindInterceptorsToSchema } from '~/engine/schema/interceptor';
import { injectGetters } from '~/engine/schema/overlay';
import { safeAssign } from '~/lib/utility';
import * as Creep from './objects/creep';
import * as RoomPosition from './position';
import * as Room from './room';
import * as RoomObject from './objects/room-object';
import * as Source from './objects/source';
import * as Store from './store';
import * as Structure from './objects/structures';
import * as StructureController from './objects/structures/controller';
import * as StructureSpawn from './objects/structures/spawn';

const schemaDeclarations = [
	RoomPosition,
	RoomObject,
	Store,

	Creep,
	Source,

	Structure,
	StructureController,
	StructureSpawn,

	Room,
];

const schemaFormat = function() {
	const format: any = {};
	for (const imports of schemaDeclarations) {
		safeAssign(format, imports.schemaFormat);
	}
	return format as UnionToIntersection<typeof schemaDeclarations[number]['schemaFormat']>;
}();

export const schema = getSchema(schemaFormat);

export const interceptorSchema = bindInterceptorsToSchema(schema, function() {
	const interceptors: any = {};
	for (const imports of schemaDeclarations) {
		// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
		safeAssign(interceptors, imports.interceptors ?? {});
	}
	return interceptors as UnionToIntersection<typeof schemaDeclarations[number]['interceptors']>;
}());

export function finalizePrototypeGetters() {
	for (const imports of schemaDeclarations) {
		// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
		for (const name of Object.keys(imports.interceptors ?? {})) {
			if (!(name in schema)) {
				throw new Error(`Schema error with identifier: ${name}`);
			} else if (!(name in imports)) {
				continue;
			}
			injectGetters(
				schema[name as keyof typeof schema] as any,
				(imports as any)[name as keyof typeof imports].prototype,
				interceptorSchema);
		}
	}
}

export const readRoom = getReader(schema.Room, interceptorSchema);
