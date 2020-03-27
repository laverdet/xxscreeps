import { checkCast, withType, BufferView, Format, Interceptor } from '~/lib/schema';
import { PositionInteger, RoomPosition } from '~/game/position';

export { RoomPosition };

export const format = withType<RoomPosition>(checkCast<Format>()({
	position: 'int32',
}));

export const interceptors = {
	RoomPosition: checkCast<Interceptor>()({
		composeFromBuffer: (view: BufferView, offset: number) =>
			new (RoomPosition as any)(view.int32[offset >>> 2]) as RoomPosition,
		decomposeIntoBuffer: (value: any, view: BufferView, offset: number) =>
			((view.int32[offset >>> 2] = value[PositionInteger], 4)),
	}),
};

export const schemaFormat = { RoomPosition: format };
