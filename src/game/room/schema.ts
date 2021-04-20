import type { RoomObject } from 'xxscreeps/game/object';
import { compose, declare, struct, variant, vector, withFallback } from 'xxscreeps/schema';
import { Room } from 'xxscreeps/game/room';
import { structForPath, variantForPath } from 'xxscreeps/engine/schema';
import { EventLogSymbol } from './event-log';
import { Objects } from './symbols';

// Schema definition
export const format = () => declare('Room', compose(shape, Room));
export const objectFormat = () => withFallback<RoomObject>()(declare('AnyObject', variant(...variantForPath('Room.objects'))));
export function shape() {
	return struct({
		...structForPath('Room'),
		name: 'string',
		[Objects]: vector(objectFormat),
		[EventLogSymbol]: vector(withFallback<any>()(variant(...variantForPath('Room.eventLog')))),
	});
}
