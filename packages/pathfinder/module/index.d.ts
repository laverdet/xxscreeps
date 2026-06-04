export const path: string;

export type WorldTerrain = Record<string, Readonly<Uint8Array>>;
export type RoomCallback = (roomName: number) => Readonly<Uint8Array> | boolean | undefined;
export interface Goal {
	pos: number;
	range: number;
}
export interface PathResult {
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
	goals: Goal[],
	roomCallback: RoomCallback | undefined,
	plainCost: number,
	swampCost: number,
	maxRooms: number,
	maxOps: number,
	maxCost: number,
	flee: boolean,
	heuristicWeight: number,
): PathResult;
