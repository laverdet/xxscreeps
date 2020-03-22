import * as RoomObject from './room-object';
import { checkCast, withType, Format, Inherit, Interceptor, Variant } from '~/engine/schema';

export const format = withType<Creep>(checkCast<Format>()({
	[Inherit]: RoomObject.format,
	[Variant]: 'creep',
	// body: makeVector({ boost: 'uint8', type: 'uint8', hits: 'uint8' })
	fatigue: 'int16',
	hits: 'int16',
	name: 'string',
	// owner: 'int32',
	// saying: ...
	// spawning?
	// store: !!!
	ageTime: 'int32',
}));

export class Creep extends RoomObject.RoomObject {
	get [Variant]() { return 'creep' }

	fatigue!: number;
	hits!: number;
	my!: boolean;
	spawning!: boolean;
}

export const interceptors = checkCast<Interceptor>()({
	overlay: Creep,
});
