import { EventLog } from './symbols';
import { Variant } from 'xxscreeps/schema';
import { extend } from 'xxscreeps/utility/utility';
import { Room } from './room';

// Union type of all events
type RemoveVariant<T> = T extends any ? Omit<T, typeof Variant> : never;
export type AnyEventLog = RemoveVariant<Room[typeof EventLog][number]>;

// Event log mutator
export function appendEventLog(room: Room, event: AnyEventLog) {
	room[EventLog].push({
		[Variant]: event.event,
		...event,
	} as never);
}

declare module './room' {
	interface Room {
		/**
		 * Returns an array of events happened on the previous tick in this room.
		 * @param raw Return as JSON string.
		 */
		getEventLog(raw?: boolean): string | AnyEventLog[];
	}
}

export default () => extend(Room, {
	getEventLog(raw = false) {
		if (raw) {
			return JSON.stringify(this[EventLog]);
		} else {
			return this[EventLog];
		}
	},
});
