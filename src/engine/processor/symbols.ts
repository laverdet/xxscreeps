import type { Room } from 'xxscreeps/game/room';
import type { RoomProcessor } from './room';
import type { IntentProcessorInfo } from '.';

export const intentProcessors: IntentProcessorInfo[] = [];
export const intentProcessorGetters = new Map<string, (instance: any) => IntentProcessorInfo>();
export const PreTick = Symbol('preTick');
export const Tick = Symbol('tick');

export type RoomTickProcessor = (room: Room, context: RoomProcessor) => void;
export const roomTickProcessors: RoomTickProcessor[] = [];
