import * as TerrainSchema from '~/game/terrain';
import { RoomPosition } from '~/game/position';
import { bindInterceptors, getReader, makeVector } from '~/lib/schema';
import { mapInPlace } from '~/lib/utility';
import type { BlobStorage } from '~/storage/blob';

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

export function getTerrainForRoom(room: string) {
	return world.get(room);
}

export async function loadTerrain(blobStorage: BlobStorage) {
	loadTerrainFromBuffer(await blobStorage.load('terrain'));
}

export function loadTerrainFromBuffer(worldTerrainBlob: Readonly<Uint8Array>) {
	loadTerrainFromWorld(readWorld(worldTerrainBlob));
}

export function loadTerrainFromWorld(loadedWorld: World) {
	world = loadedWorld;
}

//
// Schema
export const format = bindInterceptors('World', makeVector(TerrainSchema.format), {
	compose: world =>
		new Map<string, TerrainSchema.Terrain>(world.map(room => [ room.name, room.terrain ])),
	decompose: (world: World) => {
		const vector = [ ...mapInPlace(world.entries(), ([ name, terrain ]) => ({ name, terrain })) ];
		vector.sort((left, right) => left.name.localeCompare(right.name));
		return vector;
	},
});

export const readWorld = getReader(format);
