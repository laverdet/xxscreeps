import * as RoomObject from './room-object';
import { gameTime } from '~/engine/runtime';
import { makeInherit, Variant } from '~/engine/schema/format';
import { Interceptors } from '~/engine/schema/interceptor';

export const format = makeInherit(RoomObject.format, {
	[Variant]: 'source',
	energy: 'int32' as const,
	energyCapacity: 'int32' as const,
	nextRegenerationTime: 'int32' as const,
});

export const nextRegenerationTime = Symbol('nextRegenerationTime');

export class Source extends RoomObject.RoomObject {
	energy!: number;
	energyCapacity!: number;
	[nextRegenerationTime]!: number;

	get ticksToRegeneration() { return this[nextRegenerationTime] - gameTime }
}

export const interceptors: Interceptors = {
	members: {
		nextRegenerationTime: { symbol: nextRegenerationTime },
	},
	overlay: Source,
};
