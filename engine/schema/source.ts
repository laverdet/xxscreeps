import { declare, inherit, variant } from '~/lib/schema';
import { Source } from '~/game/objects/source';
import * as RoomObject from './room-object';

export const shape = declare('Source', {
	...inherit(RoomObject.format),
	...variant('source'),
	energy: 'int32',
	energyCapacity: 'int32',
	_nextRegenerationTime: 'int32',
});

export const format = declare(shape, { overlay: Source });
