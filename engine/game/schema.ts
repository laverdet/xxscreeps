import type { SchemaFormat } from '~/engine/schema';
import { archiveSchema } from '~/engine/schema/archive';
import { getSchema } from '~/engine/schema/format';
import * as RoomObject from './room-object';
import * as Creep from './creep';

const schemaFormat: SchemaFormat = {
	RoomObject: RoomObject.format,
	Creep: Creep.format,
};
const schema = getSchema(schemaFormat)
console.log(archiveSchema(schema));
