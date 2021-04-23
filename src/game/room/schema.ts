import type { RoomObject } from 'xxscreeps/game/object';
import { compose, declare, struct, variant, vector, withFallback } from 'xxscreeps/schema';
import { structForPath, variantForPath } from 'xxscreeps/engine/schema';
import { EventLog, Objects } from './symbols';
import { Room } from './room';

// Schema definition
export const format = () => declare('Room', compose(shape, Room));
export const objectFormat = () => withFallback<RoomObject>()(declare('AnyObject', variant(...variantForPath('Room.objects'))));
export function shape() {
	return struct({
		...structForPath('Room'),
		name: 'string',
		[Objects]: vector(objectFormat),
		[EventLog]: vector(withFallback<any>()(variant(...variantForPath('Room.eventLog')))),
	});
}
