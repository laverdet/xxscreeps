import type { Color } from './flag.js';
import { roomObjectShape } from 'xxscreeps/game/schema.js';
import { declare, struct, withType } from 'xxscreeps/schema/index.js';

const colorFormat = withType<Color>('int8');

/** @internal */
export const flagShape = declare('Flag', struct(roomObjectShape, {
	name: 'string',
	color: colorFormat,
	secondaryColor: colorFormat,
}));
