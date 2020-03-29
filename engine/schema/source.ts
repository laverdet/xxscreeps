import { checkCast, withType, Format, Inherit, Interceptor, Variant } from '~/lib/schema';
import { NextRegenerationTime, Source } from '~/game/objects/source';
import * as RoomObject from './room-object';

export { Source };

export const format = withType<Source>(checkCast<Format>()({
	[Inherit]: RoomObject.format,
	[Variant]: 'source',
	energy: 'int32',
	energyCapacity: 'int32',
	nextRegenerationTime: 'int32',
}));

export const interceptors = {
	Source: checkCast<Interceptor>()({
		members: {
			nextRegenerationTime: { symbol: NextRegenerationTime },
		},
		overlay: Source,
	}),
};

export const schemaFormat = { Source: format };
