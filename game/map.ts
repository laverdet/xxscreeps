import * as TerrainSchema from '~/game/terrain';
import { RoomPosition } from '~/game/position';
import { getReader, getSchema, makeVector, withType, FormatShape } from '~/lib/schema';
import { bindInterceptorsToSchema } from '~/lib/schema/interceptor';
import { mapInPlace } from '~/lib/utility';

export type World = Map<string, TerrainSchema.Terrain>;
let world: World;

export class GameMap {
	getTerrainAt(position: RoomPosition): string | undefined;
	getTerrainAt(xx: number, yy: number, roomName: string): string | undefined;
	getTerrainAt(...args: [ RoomPosition ] | [ number, number, string ]) {
		const position = args.length === 1 ? args[0] : new RoomPosition(args[0], args[1], args[2]);
		const terrain = world.get(position.roomName);
		if (terrain) {
			switch (terrain.get(position.x, position.y)) {
				case 0: return 'plain';
				case 1: return 'wall';
				case 2: return 'swamp';
				default:
			}
		}
	}
}

export function importWorldTerrain(worldTerrainBlob: Readonly<Uint8Array>) {
	world = readWorld(worldTerrainBlob);
}

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

export const readWorld = getReader(schema.World, interceptorSchema);
