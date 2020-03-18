import { getSchema } from '~/engine/schema/format';
import { bindInterceptorsToSchema } from '~/engine/schema/interceptor';
import * as Creep from './creep';
import * as Room from './room';
import * as RoomObject from './room-object';
import * as Source from './source';

export const schemaFormat = {
	RoomObject: RoomObject.format,
	Creep: Creep.format,
	Source: Source.format,
	Room: Room.format,
};

export const schema = getSchema(schemaFormat);

export const interceptorSchema = bindInterceptorsToSchema(schema, {
	RoomObject: RoomObject.interceptors,
	Source: Source.interceptors,
});
