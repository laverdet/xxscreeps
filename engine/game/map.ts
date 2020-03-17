import * as TerrainSchema from '~/engine/game/terrain';
import { bindInterceptorsToSchema } from '~/engine/schema';
import { getSchema, makeVector } from '~/engine/schema/format';

export const schema = getSchema({
	World: makeVector(TerrainSchema.format),
	Terrain: TerrainSchema.format,
});

export const readInterceptorSchema = bindInterceptorsToSchema(schema, {
	Terrain: TerrainSchema.readInterceptors,
});

export const writeInterceptorSchema = bindInterceptorsToSchema(schema, {
	Terrain: TerrainSchema.writeInterceptors,
});
