import type { Room } from '.';
import { Format, TypeOf, Variant, variant } from 'xxscreeps/schema';
export const EventLogSymbol = Symbol('eventLog');

// Union type of all events
export type AnyEventLog = TypeOf<typeof format>;

// Event log registration hook for mods
type EventLogFormatTypes = Exclude<EventLogFormats[keyof EventLogFormats], void>;
const eventLogFormats: EventLogFormatTypes[] = [];
export function registerEventLogFormat<Type extends Format>(format: Type): void | Type {
	eventLogFormats.push(format as never);
}
export interface EventLogFormats {}

// Late bound format saved on `Room` object
export const format = () => variant(...eventLogFormats);

// Event log mutator
export function appendEventLog(room: Room, event: Omit<TypeOf<typeof format>, '__variant'>) {
	room[EventLogSymbol].push({
		[Variant]: event.event,
		...event,
	} as never);
}
