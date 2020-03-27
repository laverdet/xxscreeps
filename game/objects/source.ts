import { Variant } from '~/lib/schema';
import * as RoomObject from './room-object';

export const nextRegenerationTime = Symbol('nextRegenerationTime');

export class Source extends RoomObject.RoomObject {
	get [Variant]() { return 'source' }

	energy!: number;
	energyCapacity!: number;
	[nextRegenerationTime]!: number;

	get ticksToRegeneration() { return this[nextRegenerationTime] - Game.time }
}
