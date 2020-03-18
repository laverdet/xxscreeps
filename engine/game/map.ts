import * as TerrainSchema from '~/engine/game/terrain';
import { getSchema, makeVector } from '~/engine/schema/format';
import { bindInterceptorsToSchema } from '~/engine/schema/interceptor';

export const schema = getSchema({
	World: makeVector(TerrainSchema.format),
	Terrain: TerrainSchema.format,
});

export const interceptorSchema = bindInterceptorsToSchema(schema, {
	Terrain: TerrainSchema.interceptors,
});
