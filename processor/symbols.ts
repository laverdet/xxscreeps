import type { Room } from 'xxscreeps/game/room';
import type { RoomProcessorContext } from './room';

export const IntentIdentifier = Symbol('intentIdentifier');
export const PreTick = Symbol('preTick');
export const Processors = Symbol('processors');
export const Tick = Symbol('tick');

export type RoomTickProcessor = (room: Room, context: RoomProcessorContext) => void;
export const roomTickProcessors: RoomTickProcessor[] = [];
