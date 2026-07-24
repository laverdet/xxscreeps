declare module 'xxscreeps:mods/game' {
	import type { RoomPosition } from 'xxscreeps/game/position.js';
	import type { ConstructibleStructureType } from 'xxscreeps/mods/classic/construction/construction-site.js';
	import type { ConstructionRoomSchema } from 'xxscreeps/mods/classic/construction/game.js';
	import type { ConstructionFind, ConstructionLook } from 'xxscreeps/mods/classic/construction/room.js';
	import type { ConstructionEventRoomSchemas } from 'xxscreeps/mods/classic/construction/schema.js';

	// eslint-disable-next-line @typescript-eslint/no-empty-object-type
	interface ConstructionCost {}

	enum ActionLogSchema {
		build = 'build',
		repair = 'repair',
	}
	interface Find { construction: ConstructionFind }
	interface Look { construction: ConstructionLook }
	interface RoomSchema { construction: [ ConstructionRoomSchema, ...ConstructionEventRoomSchemas ] }

	interface Room {
		/**
		 * Create new [`ConstructionSite`](https://docs.screeps.com/api/#ConstructionSite) at the
		 * specified location.
		 * @param x The X position.
		 * @param y The Y position.
		 * @param structureType One of the `STRUCTURE_*` constants.
		 * @param name The name of the structure, for structures that support it (currently only
		 * spawns). The name length limit is 100 characters.
		 * @returns One of the following codes: `OK`, `ERR_INVALID_TARGET`, `ERR_FULL`,
		 * `ERR_INVALID_ARGS`, `ERR_NOT_OWNER`, `ERR_RCL_NOT_ENOUGH`
		 * @public
		 * @see https://docs.screeps.com/api/#Room.createConstructionSite
		 */
		// eslint-disable-next-line @typescript-eslint/method-signature-style
		createConstructionSite(x: number, y: number, structureType: ConstructibleStructureType, name?: string): number;
		/**
		 * Create new [`ConstructionSite`](https://docs.screeps.com/api/#ConstructionSite) at the
		 * specified location.
		 * @param pos Can be a [`RoomPosition`](https://docs.screeps.com/api/#RoomPosition) object or
		 * any object containing [`RoomPosition`](https://docs.screeps.com/api/#RoomPosition).
		 * @param structureType One of the `STRUCTURE_*` constants.
		 * @param name The name of the structure, for structures that support it (currently only
		 * spawns). The name length limit is 100 characters.
		 * @returns One of the following codes: `OK`, `ERR_INVALID_TARGET`, `ERR_FULL`,
		 * `ERR_INVALID_ARGS`, `ERR_NOT_OWNER`, `ERR_RCL_NOT_ENOUGH`
		 * @public
		 * @see https://docs.screeps.com/api/#Room.createConstructionSite
		 */
		// eslint-disable-next-line @typescript-eslint/method-signature-style
		createConstructionSite(pos: RoomPosition, structureType: ConstructibleStructureType, name?: string): number;
	}
}

declare module 'xxscreeps:mods/processor' {
	import type { ConstructionIntents } from 'xxscreeps/mods/classic/construction/processor.js';

	interface Intent { construction: ConstructionIntents }
}
