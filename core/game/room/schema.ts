import type { RoomObject } from 'xxscreeps/game/object';
import { compose, declare, struct, variant, vector, withFallback, XSymbol } from 'xxscreeps/schema';
import { Room } from 'xxscreeps/game/room';
import { structForPath, variantForPath } from 'xxscreeps/engine/schema';
import { EventLogSymbol } from './event-log';

export const LastUpdate = XSymbol('lastUpdate');

// Schema definition
export const format = () => compose(shape, Room);
export function shape() {
	return declare('Room', struct({
		...structForPath('Room'),
		name: 'string',
		_objects: vector(withFallback<RoomObject>()(variant(...variantForPath('Room.objects')))),
		[EventLogSymbol]: vector(withFallback<any>()(variant(...variantForPath('Room.eventLog')))),
		[LastUpdate]: 'int32',
	}));
}
