import { getReader, getWriter, declare, inherit, vector, withType, TypeOf } from 'xxscreeps/schema';
import { mapToKeys } from 'xxscreeps/util/utility';
import { Color, Flag } from 'xxscreeps/game/flag';
import * as RoomObject from './room-object';

const colorFormat = withType<Color>('int8');

export type Shape = TypeOf<typeof shape>;
const shape = declare('Flag', {
	...inherit(RoomObject.format),
	name: 'string',
	color: colorFormat,
	secondaryColor: colorFormat,
});

const format = declare(shape, { overlay: Flag });

const schema = declare('Flags', vector(format), {
	compose: (flags): Record<string, Flag> => mapToKeys(flags, flag => [ flag.name, flag ]),
	decompose: (flags: Record<string, Flag>) => Object.values(flags),
});

export const read = getReader(schema);
export const write = getWriter(schema);
