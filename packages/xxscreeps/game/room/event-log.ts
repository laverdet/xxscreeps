import { Variant } from 'xxscreeps/schema/index.js';
import { extend } from 'xxscreeps/utility/utility.js';
import { Room } from './room.js';

// Union type of all events
type RemoveVariant<T> = T extends any ? Omit<T, typeof Variant> : never;
export type AnyEventLog = RemoveVariant<Room['#eventLog'][number]>;

export interface GameEvent {
	event: number;
	objectId: string;
	data?: Record<string, unknown>;
	[key: string]: unknown;
}

function toPlayerShape(entry: AnyEventLog): GameEvent {
	const { event, objectId, ...data } = entry;
	return Object.keys(data).length === 0
		? { event, objectId }
		: { event, objectId, data };
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
		getEventLog(raw?: false): GameEvent[];
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
