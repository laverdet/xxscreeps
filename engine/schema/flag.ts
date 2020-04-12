import { getReader, getWriter, declare, inherit, vector, withType, ShapeOf } from '~/lib/schema';
import { mapToKeys } from '~/lib/utility';
import { Color, Flag } from '~/game/flag';
import * as RoomObject from './room-object';

export type Shape = ShapeOf<typeof shape>;

const colorFormat = withType<Color>('int8');

export const shape = declare('Flag', {
	...inherit(RoomObject.format),
	name: 'string',
	color: colorFormat,
	secondaryColor: colorFormat,
});

const format = declare(shape, { overlay: Flag });

const schema = declare('Flags', vector(format), {
	compose: (flags): Dictionary<Flag> => mapToKeys(flags, flag => [ flag.name, flag ]),
	decompose: (flags: Dictionary<Flag>) => Object.values(flags) as Flag[],
});

export const read = getReader(schema);
export const write = getWriter(schema);
