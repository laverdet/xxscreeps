import { checkCast, makeVector, withType, Format, Interceptor } from '~/lib/schema';
import { Objects, Room } from '~/game/room';
import { variantFormat } from './variant';

export { Room };

export const format = withType<Room>(checkCast<Format>()({
	name: 'string',
	objects: makeVector(variantFormat),
}));

export const interceptors = {
	Room: checkCast<Interceptor>()({
		members: {
			objects: { symbol: Objects },
		},
		overlay: Room,
	}),
};

export const schemaFormat = { Room: format };
