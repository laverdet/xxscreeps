declare module 'xxscreeps:mods/game' {
	import type { Color, checkCreateFlag } from 'xxscreeps/mods/meta/flag/flag.js';
	import type { FlagFind, FlagLook } from 'xxscreeps/mods/meta/flag/game.js';

	interface Find { flag: FlagFind }
	interface Look { flag: FlagLook }

	interface Room {
		/**
		 * Create new [Flag](https://docs.screeps.com/api/#Flag) at the specified location.
		 * @param x The X position.
		 * @param y The Y position.
		 * @param pos Can be a [RoomPosition](https://docs.screeps.com/api/#RoomPosition) object or any
		 * object containing RoomPosition.
		 * @param name The name of a new flag. It should be unique, i.e. the `Game.flags` object should
		 * not contain another flag with the same name (hash key). If not defined, a random name will be
		 * generated. The maximum length is 100 characters.
		 * @param color The color of a new flag. Should be one of the `COLOR_*` constants. The default
		 * value is `COLOR_WHITE`.
		 * @param secondaryColor The secondary color of a new flag. Should be one of the `COLOR_*`
		 * constants. The default value is equal to `color`.
		 * @returns The name of a new flag, or one of the following error codes: `ERR_NAME_EXISTS`,
		 * `ERR_INVALID_ARGS`, `ERR_FULL`
		 * @public
		 * @see https://docs.screeps.com/api/#Room.createFlag
		 */
		// eslint-disable-next-line @typescript-eslint/method-signature-style
		createFlag(pos: RoomObject | RoomPosition, name?: string, color?: Color, secondaryColor?: Color): ReturnType<typeof checkCreateFlag> | string;
		// eslint-disable-next-line @typescript-eslint/method-signature-style
		createFlag(x: number, y: number, name?: string, color?: Color, secondaryColor?: Color): ReturnType<typeof checkCreateFlag> | string;
	}
}
