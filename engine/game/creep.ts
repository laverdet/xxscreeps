import * as RoomObject from './room-object';
import { makeInherit, Variant } from '~/engine/schema/format';

export const type = 'creep';
export const format = makeInherit(RoomObject.format, {
	[Variant]: 'creep',
	// body: makeVector({ boost: 'uint8', type: 'uint8', hits: 'uint8' })
	fatigue: 'int16' as const,
	hits: 'int16' as const,
	name: 'string' as const,
	// owner: 'int32' as const,
	// saying: ...
	// spawning?
	// store: !!!
	ageTime: 'int32' as const,
});

export class Creep extends RoomObject.RoomObject {
	fatigue!: number;
	hits!: number;
}
