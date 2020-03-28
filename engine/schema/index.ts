import { getReader, getSchema } from '~/lib/schema';
import { bindInterceptorsToSchema } from '~/lib/schema/interceptor';
import { injectGetters } from '~/lib/schema/overlay';
import { safeAssign } from '~/lib/utility';
import * as ConstructionSite from './construction-site';
import * as Creep from './creep';
import * as RoomPosition from './position';
import * as Room from './room';
import * as RoomObject from './room-object';
import * as Source from './source';
import * as Store from './store';
import * as Structure from './structure';
import * as StructureController from './controller';
import * as StructureExtension from './extension';
import * as StructureSpawn from './spawn';

const schemaDeclarations = [
	RoomPosition,
	RoomObject,
	Store,

	Creep,
	Source,

	Structure,
	StructureController,
	StructureExtension,
	StructureSpawn,

	ConstructionSite,
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
				if ((imports as any).interceptors?.[name].overlay !== undefined) {
					throw new Error(`Schema ${name} is missing overlay export`);
				}
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
