import { bindInterceptorsToSchema } from '~/engine/schema';
import { getSchema } from '~/engine/schema/format';
import * as RoomObject from './room-object';
import * as Creep from './creep';

export const schemaFormat = {
	RoomObject: RoomObject.format,
	Creep: Creep.format,
};

export const schema = getSchema(schemaFormat);

export const readInterceptorSchema = bindInterceptorsToSchema(schema, {
	RoomObject: RoomObject.readInterceptors,
});

export const writeInterceptorSchema = bindInterceptorsToSchema(schema, {
	RoomObject: RoomObject.writeInterceptors,
});
