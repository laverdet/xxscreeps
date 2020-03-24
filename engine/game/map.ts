import * as TerrainSchema from '~/engine/game/terrain';
import { getSchema, makeVector, FormatShape } from '~/engine/schema/format';
import { bindInterceptorsToSchema } from '~/engine/schema/interceptor';

export type World = FormatShape<typeof worldVectorFormat>;

const worldVectorFormat = makeVector(TerrainSchema.format);
export const schema = getSchema({
	World: worldVectorFormat,
	Terrain: TerrainSchema.format,
});

export const interceptorSchema = bindInterceptorsToSchema(schema, {
	Terrain: TerrainSchema.interceptors,
});
