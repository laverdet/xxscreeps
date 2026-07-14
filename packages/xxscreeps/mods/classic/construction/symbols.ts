import type { ConstructionSite } from './construction-site.js';
import type { RoomObject } from 'xxscreeps/game/object.js';
import type { RoomPosition } from 'xxscreeps/game/position.js';
import type { Room } from 'xxscreeps/game/room/index.js';

export type ConstructionTraits = {
	obstacle: boolean | undefined;
	// May share a tile with other buildable structures (road, rampart).
	stackable?: boolean;
	checkName?: (room: Room, name?: string | null) => string | undefined | null;
	checkPlacement: (room: Room, pos: RoomPosition) => number | null;
	create: (constructionSite: ConstructionSite, name?: string) => RoomObject;
};

export const structureFactories = new Map<string, ConstructionTraits>();
