import type { Effect } from 'xxscreeps/utility/types';
import config from 'xxscreeps/config';
import * as Async from 'xxscreeps/utility/async';
import * as Timers from 'timers/promises';
import { Database, Shard } from 'xxscreeps/engine/db';
import { userToIntentRoomsSetKey } from 'xxscreeps/engine/processor/model';
import { getRunnerChannel, runnerUsersSetKey } from 'xxscreeps/engine/runner/model';
import { loadTerrain } from 'xxscreeps/driver/path-finder';
import { PlayerInstance } from 'xxscreeps/engine/runner/instance';
import { consumeSet, consumeSetMembers } from 'xxscreeps/engine/db/async';
import { checkIsEntry, getServiceChannel, handleInterrupt } from '.';
import 'xxscreeps/config/mods/import/driver';
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

// Player runner task
const executePlayer = Async.fanOut(maxConcurrency, async(userId: string, time: number) => {
	// Get or create player instance
	const instance = playerInstances.get(userId) ?? await async function() {
		const instance = await PlayerInstance.create(shard, world, userId);
		playerInstances.set(userId, instance);
		return instance;
	}();

	// Run user code
	const roomNames = await shard.scratch.smembers(userToIntentRoomsSetKey(userId));
	if (roomNames.length === 0) {
		await shard.scratch.srem('activeUsers', [ userId ]);
	} else {
		if (isEntry) {
			process.stdout.write(`+${instance.username}, `);
		}
		await instance.run(time, roomNames);
		if (isEntry) {
			process.stdout.write(`-${instance.username}, `);
		}
	}
});

// Start the runner loop
try {
	await getServiceChannel(shard).publish({ type: 'runnerConnected' });
	loop: for await (const message of Async.breakable(runnerSubscription, breaker => break1 = breaker)) {
		switch (message.type) {
			case 'shutdown':
				break loop;

			case 'run': {
				// Set up metadata and iterators for this tick
				const { time } = message;
				if (isEntry) {
					process.stdout.write(`Tick ${time}: `);
				}
				const seen = new Set<string>();
				const affinity = [ ...playerInstances.keys() ];
				const key = runnerUsersSetKey(time);
				const affinityIterator = Async.breakable(consumeSetMembers(shard.scratch, key, affinity), breaker => break2 = breaker);
				const fallbackIterator = Async.breakable(consumeSet(shard.scratch, key), breaker => break3 = breaker);
				// eslint-disable-next-line require-yield
				const pauseIfMoreRemain = async function *() {
					if (migrationTimeout > 0) {
						const count = await shard.scratch.scard(key);
						if (count > 0) {
							// This will insert a configurable timeout before taking on new player sandboxes
							const [ cancel, tickFinished ] = getServiceChannel(shard).listenFor(message => message.type === 'tickFinished');
							const timeout = Timers.setTimeout(migrationTimeout);
							await Promise.race([ tickFinished, timeout ]);
							cancel();
						}
					}
				}();
				// Run player code
				for await (const userId of Async.concat(
					Async.lookAhead(affinityIterator, 1),
					pauseIfMoreRemain,
					fallbackIterator,
				)) {
					seen.add(userId);
					await executePlayer.invoke(userId, time);
				}
				await executePlayer.drain();
				// Throwaway migrated player sandboxes
				for (const [ userId, instance ] of playerInstances) {
					if (!seen.has(userId)) {
						playerInstances.delete(userId);
						instance.disconnect();
					}
				}
				if (isEntry) {
					console.log('... done');
				}
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
