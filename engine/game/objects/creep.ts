import { gameContext } from '~/engine/game/context';
import { checkCast, withType, Format, Inherit, Interceptor, Variant } from '~/engine/schema';
import * as Id from '~/engine/util/id';

import * as RoomObject from './room-object';

export const AgeTime = Symbol('ageTime');
export const Owner = Symbol('owner');

export const format = withType<Creep>(checkCast<Format>()({
	[Inherit]: RoomObject.format,
	[Variant]: 'creep',
	ageTime: 'int32',
	// body: makeVector({ boost: 'uint8', type: 'uint8', hits: 'uint8' })
	fatigue: 'int16',
	hits: 'int16',
	name: 'string',
	owner: Id.format,
	// saying: ...
	// spawning?
	// store: !!!
}));

export class Creep extends RoomObject.RoomObject {
	get [Variant]() { return 'creep' }
	get my() { return this[Owner] === gameContext.userId }
	get ticksToLive() { return Game.time - this[AgeTime] }

	fatigue!: number;
	hits!: number;
	name!: string;
	[AgeTime]!: number;
	[Owner]!: string;
}

export const interceptors = checkCast<Interceptor>()({
	overlay: Creep,
	members: {
		ageTime: { symbol: AgeTime },
		owner: { symbol: Owner, ...Id.interceptors },
	},
});
