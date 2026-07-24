import type { RoomObject } from 'xxscreeps/game/object.js';
import type { RoomPosition } from 'xxscreeps/game/position.js';
import type { Room } from 'xxscreeps/game/room/index.js';
import type { Terrain } from 'xxscreeps/game/terrain.js';
import { makeHookRegistration } from 'xxscreeps/utility/hook.js';

type ExitSide = 'top' | 'right' | 'bottom' | 'left';
export type ExitMap = Record<ExitSide, number[]>;

export type HighwayOrientation = 'vertical' | 'horizontal' | 'crossing';

export interface GenerateRoomOptions {
	exits?: Partial<ExitMap>;
	/**
	 * Generates highway terrain -- an open travel lane flanked by wall masses on the sector-facing
	 * borders -- instead of cellular-automaton terrain. The orientation names the lane axis:
	 * `vertical` masses the left+right borders, `horizontal` the top+bottom, and `crossing` only
	 * the four corners.
	 */
	highway?: HighwayOrientation;
	/** Wall layout 1-28; omit for a random layout. */
	terrainType?: number;
	/** Swamp layout 1-14, or 0 for no swamp; omit for a random layout. */
	swampType?: number;
}

export interface RoomGeneratorContext {
	options: GenerateRoomOptions;
	/** The room being generated. Insert objects through `place` so their positions are tagged. */
	room: Room;
	/** The room's generated terrain. */
	terrain: Terrain;
	/**
	 * The first position in random order within [min, min + span) on both axes satisfying `accept`,
	 * or undefined when the terrain can't host the object anywhere.
	 */
	findRandomPosition: (min: number, span: number, accept: (position: RoomPosition) => boolean) =>
		RoomPosition | undefined;
	/**
	 * A position within [min, min + span) on both axes satisfying `accept` that stays far
	 * (Chebyshev) from every anchor -- chosen with jitter for natural variance, and undefined when
	 * no candidate keeps the minimum spacing.
	 */
	findSpreadPosition: (
		min: number, span: number,
		accept: (position: RoomPosition) => boolean,
		anchors: readonly RoomPosition[],
	) => RoomPosition | undefined;
	/** Whether `position` is an untagged wall tile with at least one passable neighbor. */
	isPlaceable: (position: RoomPosition) => boolean;
	/** Inserts `object` into the room and tags its position. */
	place: (object: RoomObject, ...tags: string[]) => void;
	/** Tags applied by earlier placements at `position`. */
	tagsAt: (position: RoomPosition) => ReadonlySet<string>;
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
