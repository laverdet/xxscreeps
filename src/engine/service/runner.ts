import type { Effect } from 'xxscreeps/utility/types.js';
import config from 'xxscreeps/config/index.js';
import { importMods } from 'xxscreeps/config/mods/index.js';
import { loadTerrain } from 'xxscreeps/driver/path-finder.js';
import { Database, Shard } from 'xxscreeps/engine/db/index.js';
import { PlayerInstance } from 'xxscreeps/engine/runner/instance.js';
import { getRunnerChannel } from 'xxscreeps/engine/runner/model.js';
import * as Async from 'xxscreeps/utility/async.js';
import { checkIsEntry, getServiceChannel, handleInterrupt } from './index.js';
import { runRunnerTick } from './runner-core.js';

await importMods('driver');
const isEntry = checkIsEntry();

// Interrupt handler
let break1: Effect | undefined;
let break2: Effect | undefined;
let break3: Effect | undefined;
handleInterrupt(() => {
	break1?.();
	break2?.();
	break3?.();
	for (const instance of playerInstances.values()) {
		instance.disconnect();
	}
	playerInstances.clear();
});

// Connect to main & storage
const db = await Database.connect();
const shard = await Shard.connect(db, 'shard0');
const runnerSubscription = await getRunnerChannel(shard).subscribe();
const maxConcurrency = config.runner.unsafeSandbox ? 1 : config.runner.concurrency;
const { migrationTimeout } = config.runner;

// Load shared terrain data
const world = await shard.loadWorld();
loadTerrain(world); // pathfinder

// Persistent player instances
const playerInstances = new Map<string, PlayerInstance>();
const inFlightTasks = new Set<Promise<void>>();

// Start the runner loop
try {
	const runnerMessages = runnerSubscription.iterable();
	await getServiceChannel(shard).publish({ type: 'runnerConnected' });
	loop: for await (const message of Async.breakable(runnerMessages, breaker => break1 = breaker)) {
		switch (message.type) {
			case 'shutdown':
				break loop;

			case 'run': {
				const { time } = message;
				await runRunnerTick({
					affinityBreaker: breaker => break2 = breaker,
					createInstance: async userId => {
						const instance = await PlayerInstance.create(shard, world, userId);
						playerInstances.set(userId, instance);
						return instance;
					},
					fallbackBreaker: breaker => break3 = breaker,
					inFlightTasks,
					isEntry,
					maxConcurrency,
					migrationTimeout,
					playerInstances,
					shard,
					time,
				});
				break;
			}
		}
	}

} finally {
	for (const instance of playerInstances.values()) {
		instance.disconnect();
	}
	runnerSubscription.disconnect();
	shard.disconnect();
	db.disconnect();
}
