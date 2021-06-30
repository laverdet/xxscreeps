import type { Room } from 'xxscreeps/game/room';
import type { RoomProcessor } from './room';
import type { Shard } from 'xxscreeps/engine/db';
import type { IntentProcessorInfo } from '.';
import { makeHookRegistration } from 'xxscreeps/utility/hook';

export const intentProcessors: IntentProcessorInfo[] = [];
export const intentProcessorGetters = new Map<string, (instance: any) => IntentProcessorInfo>();
export const PreTick = Symbol('preTick');
export const Tick = Symbol('tick');

export type RoomTickProcessor = (room: Room, context: RoomProcessor) => void;
export const roomTickProcessors: RoomTickProcessor[] = [];

export const hooks = makeHookRegistration<{
	/**
	 * Run on every room on the shard when processor continuity has been broken.
	 */
	refreshRoom(shard: Shard, room: Room): Promise<void>;
}>();
