import { compose, declare, member, struct, variant, vector } from 'xxscreeps/schema';
import { Room } from 'xxscreeps/game/room';
import { structForPath, variantForPath } from 'xxscreeps/engine/schema';
import { EventLogSymbol } from './event-log';

// Schema definition
export const format = () => compose(shape, Room);
export function shape() {
	return declare('Room', struct({
		...structForPath('Room'),
		name: 'string',
		_objects: vector(variant(...variantForPath('Room.objects'))),
		eventLog: member(EventLogSymbol,
			vector(variant(...variantForPath('Room.eventLog')))),
	}));
}
