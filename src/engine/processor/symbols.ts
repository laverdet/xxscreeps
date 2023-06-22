import type { Room } from 'xxscreeps/game/room/index.js';
import type { RoomProcessor } from './room.js';
import type { Shard } from 'xxscreeps/engine/db/index.js';
import type { IntentProcessorInfo } from './index.js';
import { makeHookRegistration } from 'xxscreeps/utility/hook.js';

export const intentProcessors: IntentProcessorInfo[] = [];
export const intentProcessorGetters = new Map<string, (instance: any) => IntentProcessorInfo>();
export const PreTick = Symbol('preTick');
export const Tick = Symbol('tick');

export type RoomTickProcessor = (room: Room, context: RoomProcessor) => void;
export const roomTickProcessors: RoomTickProcessor[] = [];

export const hooks = makeHookRegistration<{
	/**
	 * Runs after a processor phase has completed in a room.
	 */
	flushContext(): void;

	/**
	 * Run on every room on the shard when processor continuity has been broken.
	 */
	refreshRoom(shard: Shard, room: Room): Promise<void>;
}>();
