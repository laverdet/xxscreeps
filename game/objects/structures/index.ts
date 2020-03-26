import { format as roomObjectFormat, Owner, RoomObject } from '../room-object';
import { gameContext } from '~/game/context';
import { checkCast, withType, Format, Inherit, Interceptor } from '~/lib/schema';
import * as Id from '~/engine/util/id';
export { Owner };

export const format = withType<Structure>(checkCast<Format>()({
	[Inherit]: roomObjectFormat,
	hits: 'int32',
	owner: Id.format,
}));

export abstract class Structure extends RoomObject {
	abstract get structureType(): string;
	get my() { return this[Owner] === gameContext.userId }

	hits!: number;
	[Owner]!: string;
}

export const interceptors = {
	Structure: checkCast<Interceptor>()({
		overlay: Structure,
		members: {
			owner: { symbol: Owner, ...Id.interceptors },
		},
	}),
};

export const schemaFormat = { Structure: format };
