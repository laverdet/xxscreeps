import type { Color } from './flag.js';
import type { RoomObject } from 'xxscreeps/game/object.js';
import { Fn } from 'xxscreeps/functional/fn.js';
import { chainIntentChecks } from 'xxscreeps/game/checks.js';
import { userGame } from 'xxscreeps/game/index.js';
import { RoomPosition, fetchPositionArgument, fetchRoom } from 'xxscreeps/game/position.js';
import { Room } from 'xxscreeps/game/room/index.js';
import { extend, instantiate } from 'xxscreeps/utility/utility.js';
import * as C from 'xxscreeps:mods/constants';
import { Flag, checkCreateFlag, intents } from './flag.js';

declare module 'xxscreeps/game/room/index.js' {
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

extend(Room, {
	createFlag(...args: unknown[]) {
		type Rest = [ name?: string | undefined, color?: Color | undefined, secondaryColor?: Color | undefined ];
		type Signature = [ xx: number, yy: number, ...Rest ] | [ target: RoomObject | RoomPosition, ...Rest ];
		const { pos, rest } = fetchPositionArgument(this.name, args as Signature);
		const flags = userGame!.flags;
		const name = rest[0] ?? Fn.pipe(
			Fn.range(),
			$$ => Fn.map($$, ii => `Flag${ii}`),
			$$ => Fn.find($$, name => flags[name] === undefined)!);
		const color = rest[1] ?? C.COLOR_WHITE;
		const secondaryColor = rest[2] ?? color;
		const result = chainIntentChecks(
			() => {
				if (pos?.roomName !== this.name) {
					return C.ERR_INVALID_ARGS;
				}
			},
			() => checkCreateFlag(flags, pos, name, color, secondaryColor, true),
			(): undefined => {
				// Save creation intent
				intents.push({ type: 'create', params: [ name, pos!['#id'], color, secondaryColor ] });
				// Create local flag immediately
				userGame!.flags[name] = instantiate(Flag, {
					name,
					id: null as never,
					pos: pos!,
					color, secondaryColor,
				});
			},
		);
		return result === C.OK ? name : result;
	},
});

declare module 'xxscreeps/game/position.js' {
	interface RoomPosition {
		/**
		 * Create new [Flag](https://docs.screeps.com/api/#Flag) at the specified location.
		 * @param name The name of a new flag. It should be unique, i.e. the `Game.flags` object should
		 * not contain another flag with the same name (hash key). If not defined, a random name will be
		 * generated.
		 * @param color The color of a new flag. Should be one of the `COLOR_*` constants. The default
		 * value is `COLOR_WHITE`.
		 * @param secondaryColor The secondary color of a new flag. Should be one of the `COLOR_*`
		 * constants. The default value is equal to `color`.
		 * @returns The name of a new flag, or one of the following error codes: `ERR_NAME_EXISTS`,
		 * `ERR_INVALID_ARGS`
		 * @public
		 * @see https://docs.screeps.com/api/#RoomPosition.createFlag
		 */
		createFlag: (name?: string, color?: Color, secondaryColor?: Color) => ReturnType<typeof checkCreateFlag> | string;
	}
}

extend(RoomPosition, {
	createFlag(name, color = C.COLOR_WHITE, secondaryColor = color) {
		return fetchRoom(this.roomName).createFlag(this, name, color, secondaryColor);
	},
});
