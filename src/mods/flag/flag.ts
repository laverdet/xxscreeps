import type { Dictionary } from 'xxscreeps/utility/types';
import type { InspectOptionsStylized } from 'util';
import * as C from 'xxscreeps/game/constants';
import * as Memory from 'xxscreeps/mods/memory/memory';
import { PositionInteger, RoomPosition, fetchPositionArgument } from 'xxscreeps/game/position';
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
	// Flags are kind of fake objects, and don't get an id
	declare id: never;

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
					this.name, this.pos[PositionInteger],
					color, secondaryColor,
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
					this.name, this.pos[PositionInteger],
					this.color, this.secondaryColor,
				] });
				return C.OK;
			},
		);
	}

	private [Symbol.for('nodejs.util.inspect.custom')](depth: number, { stylize }: InspectOptionsStylized) {
		try {
			// The `RoomObject` printer can fail here because these are instantiated and added to game
			// state without reading a `BufferObject`
			const { pos, name } = this;
			return `[Flag ${stylize(name, 'string')} ${stylize(pos.roomName, 'string')} ` +
				`{${stylize(`${pos.x}`, 'number')}, ${stylize(`${pos.y}`, 'number')}}]`;
		} catch (err) {
			// I'm not sure how this would be possible since the flag payload is only read once
			return `${stylize('[Flag]', 'special')} ${stylize('{released}', 'null')}`;
		}
	}
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
	checkName = false,
) {
	return chainIntentChecks(
		() => checkFlagPosition(pos),
		() => checkFlagColors(color, secondaryColor),
		() => {
			if (typeof name !== 'string' || name.length === 0 || name.length > 100) {
				return C.ERR_INVALID_ARGS;
			} else if (checkName && (name in flags)) {
				return C.ERR_NAME_EXISTS;

			} else if (Object.keys(flags).length >= C.FLAGS_LIMIT) {
				return C.ERR_FULL;
			}
			return C.OK;
		},
	);
}
