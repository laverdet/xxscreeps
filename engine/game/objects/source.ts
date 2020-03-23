import * as RoomObject from './room-object';
import { checkCast, withType, Format, Inherit, Interceptor, Variant } from '~/engine/schema';

export const format = withType<Source>(checkCast<Format>()({
	[Inherit]: RoomObject.format,
	[Variant]: 'source',
	energy: 'int32',
	energyCapacity: 'int32',
	nextRegenerationTime: 'int32',
}));

export const nextRegenerationTime = Symbol('nextRegenerationTime');

export class Source extends RoomObject.RoomObject {
	get [Variant]() { return 'source' }

	energy!: number;
	energyCapacity!: number;
	[nextRegenerationTime]!: number;

	get ticksToRegeneration() { return this[nextRegenerationTime] - Game.time }
}

export const interceptors = {
	Source: checkCast<Interceptor>()({
		members: {
			nextRegenerationTime: { symbol: nextRegenerationTime },
		},
		overlay: Source,
	}),
};

export const schemaFormat = { Source: format };
