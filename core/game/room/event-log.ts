import type { Room } from '.';
import { Variant } from 'xxscreeps/schema';
export const EventLogSymbol = Symbol('eventLog');

// Union type of all events
type RemoveVariant<T> = T extends any ? Omit<T, typeof Variant> : never;
export type AnyEventLog = RemoveVariant<Room[typeof EventLogSymbol][number]>;

// Event log mutator
export function appendEventLog(room: Room, event: AnyEventLog) {
	room[EventLogSymbol].push({
		[Variant]: event.event,
		...event,
	} as never);
}
