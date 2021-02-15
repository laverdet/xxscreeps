import { declare } from 'xxscreeps/schema';
import { PositionInteger, RoomPosition } from 'xxscreeps/game/position';

export const format = declare('RoomPosition', 'int32', {
	compose: value => new RoomPosition(value),
	decompose: (value: RoomPosition) => value[PositionInteger],
});
