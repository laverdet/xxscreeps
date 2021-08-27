import type { Dictionary } from 'xxscreeps/utility/types';
import type { FlagIntent } from './model';
import type { InspectOptionsStylized } from 'util';
import * as C from 'xxscreeps/game/constants';
import * as Memory from 'xxscreeps/mods/memory/memory';
import { RoomPosition, fetchPositionArgument } from 'xxscreeps/game/position';
import { RoomObject, format as baseFormat } from 'xxscreeps/game/object';
import { chainIntentChecks, checkString } from 'xxscreeps/game/checks';
import { compose, declare, struct, withOverlay, withType } from 'xxscreeps/schema';

export let intents: FlagIntent[] = [];
export function acquireIntents() {
	const result = intents;
	intents = [];
	return result;
}

export type Color = typeof C.COLORS_ALL[number];
const colorFormat = withType<Color>('int8');

export const format = declare('Flag', () => compose(shape, Flag));
const shape = struct(baseFormat, {
	name: 'string',
	color: colorFormat,
	secondaryColor: colorFormat,
});

export class Flag extends withOverlay(RoomObject, shape) {
	// Flags are kind of fake objects, and don't get an id
	declare id: never;

	get memory() {
		if (!this.my) {
			return;
		}
		return (Memory.get().flags ??= {})[this.name] ??= {};
	}

	set memory(memory: any) {
		if (!this.my) {
			return;
		}
		(Memory.get().flags ??= {})[this.name] ??= memory;
	}

	get ['#lookType']() { return C.LOOK_FLAGS }

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
					this.name, this.pos['#id'],
					color, secondaryColor,
				] });
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
					this.name, this.pos['#id'],
					this.color, this.secondaryColor,
				] });
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
	pos: RoomPosition | undefined,
	name: string,
	color: Color, secondaryColor: Color,
	checkName = false,
) {
	return chainIntentChecks(
		pos ? () => checkFlagPosition(pos) : () => C.OK,
		() => checkFlagColors(color, secondaryColor),
		() => {
			if (checkString(name, 100, true)) {
				return C.ERR_INVALID_ARGS;
			} else if (checkName && (name in flags)) {
				return C.ERR_NAME_EXISTS;

			} else if (Object.keys(flags).length >= C.FLAGS_LIMIT) {
				return C.ERR_FULL;
			}
		});
}
