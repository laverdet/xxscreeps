import { Variant } from 'xxscreeps/schema/index.js';
import { extend } from 'xxscreeps/utility/utility.js';
import { Room } from './room.js';

// Union type of all events
type RemoveVariant<T> = T extends any ? Omit<T, typeof Variant> : never;
export type AnyEventLog = RemoveVariant<Room['#eventLog'][number]>;

// Vanilla shape: `{event, objectId, data?}`, with `data` omitted when there are no
// extra fields. Distributes over the union so per-variant payloads stay narrowable.
type EventToPlayer<E> = E extends { event: infer Ev; objectId: infer Id }
	? Omit<E, 'event' | 'objectId'> extends infer D
		? keyof D extends never
			? { event: Ev; objectId: Id }
			: { event: Ev; objectId: Id; data: D }
		: never
	: never;
export type PlayerEventLog = EventToPlayer<AnyEventLog>;

function toPlayerShape(entry: AnyEventLog): PlayerEventLog {
	const { event, objectId, ...data } = entry;
	return (Object.keys(data).length === 0
		? { event, objectId }
		: { event, objectId, data }) as PlayerEventLog;
}

// Event log mutator
export function appendEventLog(room: Room, event: AnyEventLog) {
	room['#eventLog'].push({
		[Variant]: event.event,
		...event,
	} as never);
}

declare module './room.js' {
	interface Room {
		/**
		 * Returns an array of events happened on the previous tick in this room.
		 * @param raw Return as JSON string.
		 */
		// eslint-disable-next-line @typescript-eslint/method-signature-style
		getEventLog(raw: true): string;
		// eslint-disable-next-line @typescript-eslint/method-signature-style
		getEventLog(raw?: false): PlayerEventLog[];
	}
}

extend(Room, {
	// @ts-expect-error
	getEventLog(raw = false) {
		const translated = (this['#eventLog'] as AnyEventLog[]).map(toPlayerShape);
		// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
		return raw ? JSON.stringify(translated) : translated;
	},
});
