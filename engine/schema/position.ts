import { declare } from '~/lib/schema';
import { PositionInteger, RoomPosition } from '~/game/position';

export const format = declare('RoomPosition', 'int32', {
	compose: value => new RoomPosition(value),
	decompose: (value: RoomPosition) => value[PositionInteger],
});
