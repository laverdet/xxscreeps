import { gameContext } from '~/engine/game/context';
import { checkCast, withType, Format, Inherit, Interceptor, Variant } from '~/engine/schema';
import * as Id from '~/engine/util/id';
import * as RoomObject from './room-object';
import * as Store from '../store';

declare const Memory: any;

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
	store: Store.format,
}));

export class Creep extends RoomObject.RoomObject {
	get [Variant]() { return 'creep' }
	get memory() {
		const creeps = Memory.creeps ?? (Memory.creeps = {});
		return creeps[this.name] ?? (creeps[this.name] = {});
	}
	get my() { return this[Owner] === gameContext.userId }
	get spawning() { return this[AgeTime] === 0 }
	get ticksToLive() { return this[AgeTime] === 0 ? undefined : Game.time - this[AgeTime] }

	fatigue!: number;
	hits!: number;
	name!: string;
	store!: Store.Store;
	protected [AgeTime]!: number;
	protected [Owner]!: string;
}

export const interceptors = checkCast<Interceptor>()({
	overlay: Creep,
	members: {
		ageTime: { symbol: AgeTime },
		owner: { symbol: Owner, ...Id.interceptors },
	},
});
