import { declare, inherit, variant, withSymbol } from '~/lib/schema';
import { NextRegenerationTime, Source } from '~/game/objects/source';
import * as RoomObject from './room-object';

export const shape = declare('Source', {
	...inherit(RoomObject.format),
	...variant('source'),
	energy: 'int32',
	energyCapacity: 'int32',
	nextRegenerationTime: withSymbol(NextRegenerationTime, 'int32'),
});

export const format = declare(shape, { overlay: Source });
