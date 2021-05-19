import type { RoomObject } from 'xxscreeps/game/object';
import { compose, declare, struct, variant, vector, withFallback } from 'xxscreeps/schema';
import { structForPath, variantForPath } from 'xxscreeps/engine/schema';
import { Room } from './room';

// Schema definition
export const format = () => declare('Room', compose(shape, Room));
export const objectFormat = () => withFallback<RoomObject>()(declare('AnyObject', variant(...variantForPath('Room.objects'))));
export function shape() {
	return struct({
		...structForPath('Room'),
		name: 'string',
		'#objects': vector(objectFormat),
		'#users': struct({
			intents: vector('string'),
			presence: vector('string'),
			vision: vector('string'),
		}),
		'#eventLog': vector(withFallback<any>()(variant(...variantForPath('Room.eventLog')))),
	});
}
