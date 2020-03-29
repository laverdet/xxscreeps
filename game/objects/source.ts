import { Variant } from '~/lib/schema';
import * as RoomObject from './room-object';

export const NextRegenerationTime = Symbol('nextRegenerationTime');

export class Source extends RoomObject.RoomObject {
	get [Variant]() { return 'source' }

	energy!: number;
	energyCapacity!: number;
	[NextRegenerationTime]!: number;

	get ticksToRegeneration() {
		return this[NextRegenerationTime] === 0 ? undefined : this[NextRegenerationTime] - Game.time;
	}
}
