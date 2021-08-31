import type { Color } from './flag';
import type { RoomObject } from 'xxscreeps/game/object';
import * as C from 'xxscreeps/game/constants';
import * as Fn from 'xxscreeps/utility/functional';
import { userGame } from 'xxscreeps/game';
import { chainIntentChecks } from 'xxscreeps/game/checks';
import { RoomPosition, fetchPositionArgumentRest, fetchRoom } from 'xxscreeps/game/position';
import { Room } from 'xxscreeps/game/room';
import { extend, instantiate } from 'xxscreeps/utility/utility';
import { Flag, checkCreateFlag, intents } from './flag';

declare module 'xxscreeps/game/room' {
	interface Room {
		/**
		 * Create new `Flag` at the specified location
		 * @param x The X position.
		 * @param y The Y position.
		 * @param pos Can be a RoomPosition object or any object containing RoomPosition.
		 * @param name The name of a new flag. It should be unique, i.e. the `Game.flags` object should
		 * not contain another flag with the same name (hash key). If not defined, a random name will be
		 * generated.
		 * @param color The color of a new flag. Should be one of the `COLOR_*` constants. The default
		 * value is `COLOR_WHITE`.
		 * @param secondaryColor The secondary color of a new flag. Should be one of the `COLOR_*`
		 * constants. The default value is equal to `color`.
		 */
		createFlag(pos: RoomObject | RoomPosition, name?: string, color?: Color, secondaryColor?: Color): ReturnType<typeof checkCreateFlag> | string;
		createFlag(x: number, y: number, name?: string, color?: Color, secondaryColor?: Color): ReturnType<typeof checkCreateFlag> | string;
	}
}

extend(Room, {
	createFlag(arg1, arg2, ...args) {
		const { pos, rest } = fetchPositionArgumentRest(this.name, arg1, arg2, ...args);
		const flags = userGame!.flags;
		const name = rest[0] ?? Fn.firstMatching(
			Fn.map(Fn.range(), ii => `Flag${ii}`),
			// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
			name => flags[name] === undefined)!;
		const color = rest[1] ?? C.COLOR_WHITE;
		const secondaryColor = rest[2] ?? color;
		const result = chainIntentChecks(
			() => {
				if (!pos || pos.roomName !== this.name) {
					return C.ERR_INVALID_ARGS;
				}
			},
			() => checkCreateFlag(flags, pos, name, color, secondaryColor, true),
			() => {
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

declare module 'xxscreeps/game/position' {
	interface RoomPosition {
		/**
		* Create new `Flag` at the specified location
		* @param name The name of a new flag. It should be unique, i.e. the `Game.flags` object should
		* not contain another flag with the same name (hash key). If not defined, a random name will be
		* generated.
		* @param color The color of a new flag. Should be one of the `COLOR_*` constants. The default
		* value is `COLOR_WHITE`.
		* @param secondaryColor The secondary color of a new flag. Should be one of the `COLOR_*`
		* constants. The default value is equal to `color`.
		*/
		createFlag(name?: string, color?: Color, secondaryColor?: Color): ReturnType<typeof checkCreateFlag> | string;
	}
}

extend(RoomPosition, {
	createFlag(name, color = C.COLOR_WHITE, secondaryColor = color) {
		return fetchRoom(this.roomName).createFlag(this, name, color, secondaryColor);
	},
});
