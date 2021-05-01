import type { Dictionary } from 'xxscreeps/utility/types';
import * as C from 'xxscreeps/game/constants';
import * as Memory from 'xxscreeps/mods/memory/memory';
import { RoomPosition, fetchPositionArgument } from 'xxscreeps/game/position';
import { LookType, RoomObject, format as baseFormat } from 'xxscreeps/game/object';
import { chainIntentChecks } from 'xxscreeps/game/checks';
import { compose, declare, struct, withOverlay, withType } from 'xxscreeps/schema';
import { intents } from './game';

export type Color = typeof C.COLORS_ALL[number];
const colorFormat = withType<Color>('int8');

export const format = () => compose(shape, Flag);
const shape = declare('Flag', struct(baseFormat, {
	name: 'string',
	color: colorFormat,
	secondaryColor: colorFormat,
}));

export class Flag extends withOverlay(RoomObject, shape) {
	get memory() {
		const memory = Memory.get();
		const flags = memory.flags ??= {};
		return flags[this.name] ??= {};
	}

	get [LookType]() { return C.LOOK_FLAGS }

	/**
	 * Remove the flag
	 */
	remove() {
		intents.push({ type: 'remove', params: [ this.name ] });
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
				intents.push({ type: 'create', params: [
					this.name, this.pos,
					color, secondaryColor, true,
				] });
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
				intents.push({ type: 'create', params: [
					this.name, this.pos,
					this.color, this.secondaryColor, true,
				] });
				return C.OK;
			},
		);
	}

	// Flags are kind of fake objects, and don't get an id
	declare id: never;
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
	flags: Dictionary<Flag>,
	pos: RoomPosition,
	name: string,
	color: Color, secondaryColor: Color,
) {
	return chainIntentChecks(
		() => checkFlagPosition(pos),
		() => checkFlagColors(color, secondaryColor),
		() => {
			if (typeof name !== 'string' || name.length === 0 || name.length > 100) {
				return C.ERR_INVALID_ARGS;

			} else if (Object.keys(flags).length >= C.FLAGS_LIMIT) {
				return C.ERR_FULL;
			}
			return C.OK;
		},
	);
}
