import * as Fn from 'xxscreeps/utility/functional';
import * as TerrainSchema from 'xxscreeps/game/terrain';
import { RoomPosition } from 'xxscreeps/game/position';
import { compose, declare, makeReader, vector } from 'xxscreeps/schema';
import type { PersistenceProvider } from 'xxscreeps/storage/provider';

export type World = Map<string, TerrainSchema.Terrain>;
let world: World;

function describeExits() {
	return [];
}

function findRoute() {
	return [];
}

function getRoomLinearDistance() {
	return Infinity;
}

export function getTerrainAt(position: RoomPosition): string | undefined;
export function getTerrainAt(xx: number, yy: number, roomName: string): string | undefined;
export function getTerrainAt(...args: [ RoomPosition ] | [ number, number, string ]) {
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

export function getTerrainForRoom(room: string) {
	return world.get(room)!;
}

export async function loadTerrain(persistence: PersistenceProvider) {
	loadTerrainFromBuffer(await persistence.get('terrain'));
}

export function loadTerrainFromBuffer(worldTerrainBlob: Readonly<Uint8Array>) {
	loadTerrainFromWorld(readWorld(worldTerrainBlob));
}

export function loadTerrainFromWorld(loadedWorld: World) {
	world = loadedWorld;
}

export default { describeExits, findRoute, getRoomLinearDistance, getTerrainAt };

//
// Schema
export const format = declare('World', compose(vector(TerrainSchema.format), {
	compose: world =>
		new Map<string, TerrainSchema.Terrain>(world.map(room => [ room.name, room.terrain ])),
	decompose: (world: World) => {
		const vector = [ ...Fn.map(world.entries(), ([ name, terrain ]) => ({ name, terrain })) ];
		vector.sort((left, right) => left.name.localeCompare(right.name));
		return vector;
	},
}));

export const readWorld = makeReader(format);
