import { bindInterceptors, withSymbol, Inherit, Variant } from '~/lib/schema';
import { NextRegenerationTime, Source } from '~/game/objects/source';
import * as RoomObject from './room-object';

export const shape = bindInterceptors('Source', {
	[Inherit]: RoomObject.format,
	[Variant]: 'source',
	energy: 'int32',
	energyCapacity: 'int32',
	nextRegenerationTime: 'int32',
}, {
	members: {
		nextRegenerationTime: withSymbol(NextRegenerationTime),
	},
});

export const format = bindInterceptors(shape, { overlay: Source });
