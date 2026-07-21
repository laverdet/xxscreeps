import type { RoomObject } from 'xxscreeps/game/object.js';
import type { Room } from 'xxscreeps/game/room/index.js';
import { makeHookRegistration } from 'xxscreeps/utility/hook.js';

type ExitSide = 'top' | 'right' | 'bottom' | 'left';
export type ExitMap = Record<ExitSide, number[]>;

export interface GenerateRoomOptions {
	exits?: Partial<ExitMap>;
	/** Wall layout 1-28; omit for a random layout. */
	terrainType?: number;
	/** Swamp layout 1-14, or 0 for no swamp; omit for a random layout. */
	swampType?: number;
}

export interface RoomGeneratorContext {
	options: GenerateRoomOptions;
	/** The room being generated. Insert objects through `place` so their tiles are tagged. */
	room: Room;
	/**
	 * Rolls uniformly random tiles within [min, min + span) on both axes until one satisfies
	 * `accept`, returning undefined after 1000 failed rolls to signal terrain that can't host the
	 * object.
	 */
	findRandomTile: (min: number, span: number, accept: (xx: number, yy: number) => boolean) =>
		readonly [ number, number ] | undefined;
	/** Whether (xx, yy) is an untagged wall tile with at least one passable neighbor. */
	isPlaceable: (xx: number, yy: number) => boolean;
	/** Whether (xx, yy) is a wall tile. */
	isWall: (xx: number, yy: number) => boolean;
	/** Inserts `object` into the room and tags its tile. */
	place: (object: RoomObject, ...tags: string[]) => void;
	/** Tags applied by earlier placements at (xx, yy). */
	tagsAt: (xx: number, yy: number) => ReadonlySet<string>;
}

export const hooks = makeHookRegistration<{
	roomGenerator: {
		/** Passes run in ascending order; constraints may consult earlier placements. */
		order: number;
		/**
		 * Returns false when the terrain can't satisfy this pass's placement constraints; the room
		 * is discarded and regenerated on fresh terrain, up to a bounded number of attempts.
		 */
		generate: (context: RoomGeneratorContext) => boolean;
	};
}>();
