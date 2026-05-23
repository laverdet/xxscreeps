import type { Shard } from 'xxscreeps/engine/db/index.js';
import type { Effect, MaybePromise } from 'xxscreeps/utility/types.js';
import { makeHookRegistration } from 'xxscreeps/utility/hook.js';

export const hooks = makeHookRegistration<{
	/**
	 * Called once after the main service is initialized and ready to start ticking.
	 * Return an Effect to register a cleanup that runs on shutdown.
	 */
	serviceInitialized: (shard: Shard) => MaybePromise<Effect | void>;

	/**
	 * Called after each game tick completes, with wall-clock timing.
	 */
	afterTick: (context: { shard: Shard; timeTaken: number; averageTime: number }) => MaybePromise<void>;
}>();
