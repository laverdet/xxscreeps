import { bindInterceptors } from '~/lib/schema';
import { PositionInteger, RoomPosition } from '~/game/position';

export const format = bindInterceptors('RoomPosition', 'int32', {
	compose: value => new RoomPosition(value),
	decompose: (value: RoomPosition) => value[PositionInteger],
});
