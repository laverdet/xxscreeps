import * as RoomObject from '../room-object';
import { gameContext } from '~/engine/game/context';
import { checkCast, withType, Format, Inherit, Interceptor } from '~/engine/schema';
import * as Id from '~/engine/util/id';

export const Owner = Symbol('owner');

export const format = withType<Structure>(checkCast<Format>()({
	[Inherit]: RoomObject.format,
	hits: 'int32',
	owner: Id.format,
}));

export abstract class Structure extends RoomObject.RoomObject {
	abstract get structureType(): string;
	get my() { return this[Owner] === gameContext.userId }

	hits!: number;
	[Owner]!: string;
}

export const interceptors = checkCast<Interceptor>()({
	overlay: Structure,
	members: {
		owner: { symbol: Owner, ...Id.interceptors },
	},
});
