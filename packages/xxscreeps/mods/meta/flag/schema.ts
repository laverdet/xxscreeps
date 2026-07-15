import type { Color } from './flag.js';
import { roomObjectShape } from 'xxscreeps/game/schema.js';
import { declare, struct, withType } from 'xxscreeps/schema/index.js';

const colorFormat = withType<Color>('int8');

/** @internal */
export const flagShape = declare('Flag', struct(roomObjectShape, {
	/**
	 * Flag's name. You can choose the name while creating a new flag, and it cannot be changed later.
	 * This name is a hash key to access the flag via the
	 * [Game.flags](https://docs.screeps.com/api/#Game.flags) object. The maximum name length is 100
	 * characters.
	 * @public
	 * @see https://docs.screeps.com/api/#Flag.name
	 */
	name: 'string',

	/**
	 * Flag primary color. One of the `COLOR_*` constants.
	 * @public
	 * @see https://docs.screeps.com/api/#Flag.color
	 */
	color: colorFormat,

	/**
	 * Flag secondary color. One of the `COLOR_*` constants.
	 * @public
	 * @see https://docs.screeps.com/api/#Flag.secondaryColor
	 */
	secondaryColor: colorFormat,
}));
