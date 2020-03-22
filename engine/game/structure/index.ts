import * as RoomObject from '../room-object';
import { checkCast, withType, Format, Inherit, Interceptor } from '~/engine/schema';

export const format = withType<Structure>(checkCast<Format>()({
	[Inherit]: RoomObject.format,
	hits: 'int32',
}));

export abstract class Structure extends RoomObject.RoomObject {
	hits!: number;
	my!: boolean;

	abstract get structureType(): string;
}

export const interceptors = checkCast<Interceptor>()({
	overlay: Structure,
});
