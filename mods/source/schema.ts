import { declare, inherit, variant, TypeOf } from 'xxscreeps/schema';
import * as RoomObject from 'xxscreeps/engine/schema/room-object';
import { Source } from './source';

export type Shape = TypeOf<typeof shape>;
const shape = declare('Source', {
	...inherit(RoomObject.format),
	...variant('source'),
	energy: 'int32',
	energyCapacity: 'int32',
	_nextRegenerationTime: 'int32',
});

const format = declare(shape, { overlay: Source });
declare module 'xxscreeps/engine/schema' {
	interface RoomObjectFormats { source: typeof format }
}
