import type { Room } from '.';
import { Variant } from 'xxscreeps/schema';
export const EventLogSymbol = Symbol('eventLog');

// Union type of all events
export type AnyEventLog = Omit<Room[typeof EventLogSymbol][number], '__variant'>;

// Event log mutator
export function appendEventLog(room: Room, event: AnyEventLog) {
	room[EventLogSymbol].push({
		[Variant]: event.event,
		...event,
	} as never);
}
