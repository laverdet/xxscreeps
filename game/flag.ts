import * as C from './constants';
import * as Game from './game';
import * as Memory from './memory';
import { extractPositionId, fetchPositionArgument, RoomPosition } from './position';
import { chainIntentChecks, RoomObject } from './objects/room-object';
import { withOverlay } from '~/lib/schema';
import type { shape, Shape } from '~/engine/schema/flag';

export type Color = typeof C.COLORS_ALL[number];

export class Flag extends withOverlay<typeof shape>()(RoomObject) {
	get memory() {
		const memory = Memory.get();
		const flags = memory.flags ?? (memory.flags = {});
		return flags[this.name] ?? (flags[this.name] = {});
	}

	get room() { return Game.rooms[this.pos.roomName]! }

	/**
	 * Remove the flag
	 */
	remove() {
		Game.intents.push('flags', 'remove', { name: this.name });
		return C.OK;
	}

	/**
	 * Set new color of the flag
	 * @param color Primary color of the flag. One of the `COLOR_*` constants
	 * @param secondaryColor Secondary color of the flag. One of the `COLOR_*` constants
	 */
	setColor(color: Color, secondaryColor = color) {
		return chainIntentChecks(
			() => checkFlagColors(color, secondaryColor),
			() => {
				Game.intents.push('flags', 'create', {
					name: this.name,
					pos: extractPositionId(this.pos),
					color, secondaryColor,
				});
				return C.OK;
			},
		);
	}

	/**
	 * Set new position of the flag
	 * @param x X position in the same room
	 * @param y Y position in the same room
	 * @param target Can be a RoomObject or RoomPosition
	 */
	setPosition(x: number, y: number): C.ErrorCode;
	setPosition(target: RoomObject | RoomPosition): C.ErrorCode;
	setPosition(...args: [ number, number ] | [ RoomObject | RoomPosition]) {
		const { pos } = fetchPositionArgument(this.pos.roomName, ...args);
		return chainIntentChecks(
			() => checkFlagPosition(pos!),
			() => {
				Game.intents.push('flags', 'create', {
					name: this.name,
					pos: extractPositionId(this.pos),
					color: this.color, secondaryColor: this.secondaryColor,
				});
				return C.OK;
			},
		);
	}

	// Unused properties from `RoomObject`
	id!: never;
	_lookType!: never;
}

//
// Utilities & intent checks
function isValidColor(color: Color) {
	return Number.isInteger(color) && color >= C.COLOR_RED && color <= C.COLOR_WHITE;
}

function checkFlagColors(color: Color, secondaryColor: Color) {
	if (!isValidColor(color) || !isValidColor(secondaryColor)) {
		return C.ERR_INVALID_ARGS;
	}
	return C.OK;
}

function checkFlagPosition(pos: RoomPosition) {
	if (!(pos instanceof RoomPosition)) {
		return C.ERR_INVALID_ARGS;
	}
	return C.OK;
}

export function checkCreateFlag(
	flags: Dictionary<Shape>,
	pos: RoomPosition,
	name: string,
	color: Color, secondaryColor: Color,
) {
	return chainIntentChecks(
		() => checkFlagPosition(pos),
		() => checkFlagColors(color, secondaryColor),
		() => {
			if (typeof name !== 'string' || name.length > 60) {
				return C.ERR_INVALID_ARGS;

			} else if (Object.keys(flags).length >= C.FLAGS_LIMIT) {
				return C.ERR_FULL;
			}
			return C.OK;
		},
	);
}
