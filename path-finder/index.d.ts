export const path: string;

export function loadTerrain(world: Record<string, Readonly<Uint8Array>>): void;

export function search(
	origin: number,
	goals: { pos: number; range: number }[],
	roomCallback?: (roomName: number) => Uint8Array | boolean | undefined,
	plainCost: number,
	swampCost: number,
	maxRooms: number,
	maxOps: number,
	maxCost: number,
	flee: boolean,
	heuristicWeight: number,
);
