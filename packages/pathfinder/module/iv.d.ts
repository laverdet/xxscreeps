export const module: import('@isolated-vm/experimental').NativeModule;

interface RoomEntry {
	room: number;
	terrain: Readonly<Uint8Array>;
}
type WorldTerrain = readonly RoomEntry[];
type RoomCallback = (roomName: number) => Readonly<Uint8Array> | boolean | undefined;
interface Goal {
	pos: number;
	range: number;
}
interface PathResult {
	path: number[];
	ops: number;
	cost: number;
	incomplete: boolean;
}

export const path: string;
export const version: number;

export function loadTerrain(world: WorldTerrain): void;

export function search(
	origin: number,
	goals: readonly Goal[],
	roomCallback: RoomCallback | undefined,
	plainCost: number,
	swampCost: number,
	maxRooms: number,
	maxOps: number,
	maxCost: number,
	flee: boolean,
	heuristicWeight: number,
): PathResult;
