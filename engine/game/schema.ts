import type { SchemaFormat } from '~/engine/schema';
import { getSchema } from '~/engine/schema/format';
import * as RoomObject from './room-object';
import * as Creep from './creep';

export const schemaFormat: SchemaFormat = {
	RoomObject: RoomObject.format,
	Creep: Creep.format,
};
export const schema = getSchema(schemaFormat);
