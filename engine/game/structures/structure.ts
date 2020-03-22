import * as RoomObject from '../room-object';
import { checkCast, withType, Format, Inherit, Interceptor } from '~/engine/schema';

export const format = withType<Structure>(checkCast<Format>()({
	[Inherit]: RoomObject.format,
	hits: 'int32',
}));

export class Structure extends RoomObject.RoomObject {
	hits!: number;
}

export const interceptors = checkCast<Interceptor>()({
	overlay: Structure,
});
