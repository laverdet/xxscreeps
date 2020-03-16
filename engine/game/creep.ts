import * as RoomObject from './room-object';
import { makeInherit } from '~/engine/schema/format';

export const format = makeInherit(RoomObject.format, {
	// body: makeVector({ boost: 'uint8', type: 'uint8', hits: 'uint8' })
	fatigue: 'uint16' as const,
	hits: 'uint16' as const,
	name: 'string' as const,
	// owner: 'int32' as const,
	// saying: ...
	// spawning?
	// store: !!!
	oldAgeTime: 'uint32' as const,
});

export class Creep extends RoomObject.RoomObject {
	fatigue!: number;
	hits!: number;
}
