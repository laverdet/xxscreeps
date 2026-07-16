import type { FlagIntent } from './model.js';
import type { InspectOptionsStylized } from 'node:util';
import type { Dictionary } from 'xxscreeps/utility/types.js';
import { chainIntentChecks, checkString } from 'xxscreeps/game/checks.js';
import * as C from 'xxscreeps/game/constants/index.js';
import { RoomObject } from 'xxscreeps/game/object.js';
import { RoomPosition, fetchPositionArgument } from 'xxscreeps/game/position.js';
import * as Memory from 'xxscreeps/mods/meta/memory/memory.js';
import { withOverlay } from 'xxscreeps/schema/index.js';
import { flagShape } from './schema.js';

export let intents: FlagIntent[] = [];
export function acquireIntents() {
	const result = intents;
	intents = [];
	return result;
}

/** @public */
export type Color = typeof C.COLORS_ALL[number];

/**
 * A flag. Flags can be used to mark particular spots in a room. Flags are visible to their owners
 * only. You cannot have more than 10,000 flags.
 * @public
 * @see https://docs.screeps.com/api/#Flag
 */
export class Flag extends withOverlay(RoomObject, flagShape) {
	// Flags are kind of fake objects, and don't get an id
	declare id: never;

	/**
	 * A shorthand to `Memory.flags[flag.name]`. You can use it for quick access the flag's specific
	 * memory data object.
	 * @public
	 * @see https://docs.screeps.com/api/#Flag.memory
	 */
	get memory() {
		return (Memory.get().flags ??= {})[this.name] ??= {};
	}

	get '#lookType'() { return C.LOOK_FLAGS; }

	set memory(memory: Record<string, unknown>) {
		(Memory.get().flags ??= {})[this.name] ??= memory;
	}

	/**
	 * Remove the flag.
	 * @returns Always returns `OK`.
	 * @public
	 * @see https://docs.screeps.com/api/#Flag.remove
	 */
	remove() {
		intents.push({ type: 'remove', params: [ this.name ] });
		return C.OK;
	}

	/**
	 * Set new color of the flag.
	 * @param color Primary color of the flag. One of the `COLOR_*` constants.
	 * @param secondaryColor Secondary color of the flag. One of the `COLOR_*` constants.
	 * @returns One of the following codes: `OK`, `ERR_INVALID_ARGS`
	 * @public
	 * @see https://docs.screeps.com/api/#Flag.setColor
	 */
	setColor(color: Color, secondaryColor = color) {
		return chainIntentChecks(
			() => checkFlagColors(color, secondaryColor),
			(): undefined => {
				intents.push({ type: 'create', params: [
					this.name, this.pos['#id'],
					color, secondaryColor,
				] });
			},
		);
	}

	/**
	 * Set new position of the flag.
	 * @param x The X position in the room.
	 * @param y The Y position in the room.
	 * @param target Can be a [RoomPosition](https://docs.screeps.com/api/#RoomPosition) object or any
	 * object containing RoomPosition.
	 * @returns One of the following codes: `OK`, `ERR_INVALID_ARGS`
	 * @public
	 * @see https://docs.screeps.com/api/#Flag.setPosition
	 */
	setPosition(x: number, y: number): C.ErrorCode;
	setPosition(target: RoomObject | RoomPosition): C.ErrorCode;
	setPosition(...args: [ number, number ] | [ RoomObject | RoomPosition]) {
		const { pos } = fetchPositionArgument(this.pos.roomName, ...args);
		return chainIntentChecks(
			() => checkFlagPosition(pos!),
			(): undefined => {
				intents.push({ type: 'create', params: [
					this.name, pos!['#id'],
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
		} catch {
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
		() => Object.keys(flags).length >= C.FLAGS_LIMIT ? C.ERR_FULL : C.OK,
		() => checkFlagColors(color, secondaryColor),
		() => checkName && (name in flags) ? C.ERR_NAME_EXISTS : C.OK,
		() => checkString(name, 100, true));
}
