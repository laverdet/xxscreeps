import * as TerrainSchema from '~/engine/game/terrain';
import { getReader, getSchema, makeVector, withType, FormatShape } from '~/engine/schema';
import { bindInterceptorsToSchema } from '~/engine/schema/interceptor';
import { mapInPlace } from '~/lib/utility';

export type World = Map<string, TerrainSchema.Terrain>;

export const schema = getSchema({
	Terrain: TerrainSchema.format,
	World: withType<World>(makeVector(TerrainSchema.format)),
});

export const interceptorSchema = bindInterceptorsToSchema(schema, {
	Terrain: TerrainSchema.interceptors,
	World: {
		compose: (world: FormatShape<typeof TerrainSchema.format>[]) =>
			new Map(world.map(room => [ room.name, room.terrain ])),
		decompose: (world: World) => {
			const vector = [ ...mapInPlace(world.entries(), ([ name, terrain ]) => ({ name, terrain })) ];
			vector.sort((left, right) => left.name.localeCompare(right.name));
			return vector;
		},
	},
});

const worldReader = getReader(schema.World, interceptorSchema);
export function readWorld(blob: Readonly<Uint8Array>) {
	return worldReader(blob);
}
