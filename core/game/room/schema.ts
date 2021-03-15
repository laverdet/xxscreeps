import type { RoomObject } from 'xxscreeps/game/object';
import { compose, declare, member, struct, variant, vector, withFallback } from 'xxscreeps/schema';
import { Room } from 'xxscreeps/game/room';
import { structForPath, variantForPath } from 'xxscreeps/engine/schema';
import { EventLogSymbol } from './event-log';

// Schema definition
export const format = () => compose(shape, Room);
export function shape() {
	return declare('Room', struct({
		...structForPath('Room'),
		name: 'string',
		_objects: vector(withFallback<RoomObject>()(variant(...variantForPath('Room.objects')))),
		eventLog: member(EventLogSymbol,
			vector(withFallback<any>()(variant(...variantForPath('Room.eventLog'))))),
	}));
}
