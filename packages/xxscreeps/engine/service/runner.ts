import type { Effect } from 'xxscreeps/utility/types.js';
import * as Timers from 'node:timers/promises';
import config from 'xxscreeps/config/index.js';
import { importMods } from 'xxscreeps/config/mods/index.js';
import { loadTerrain } from 'xxscreeps/driver/pathfinder.js';
import { consumeSet, consumeSetMembers } from 'xxscreeps/engine/db/async.js';
import { Database, Shard } from 'xxscreeps/engine/db/index.js';
import { userToIntentRoomsSetKey, userToVisibleRoomsSetKey } from 'xxscreeps/engine/processor/model.js';
import { PlayerInstance } from 'xxscreeps/engine/runner/instance.js';
import { getRunnerChannel, runnerUsersSetKey } from 'xxscreeps/engine/runner/model.js';
import * as Async from 'xxscreeps/utility/async.js';
import { checkIsEntry, getServiceChannel, handleInterrupt } from './index.js';
import { Fn } from 'xxscreeps/functional/fn.js';

await importMods('driver');
const isEntry = checkIsEntry();
const log = config.runner.log ?? isEntry
	? (message: string) => process.stderr.write(message)
	: () => {};

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
using disposable = new DisposableStack();
using db = await Database.connect();
using shard = await Shard.connect(db, 'shard0');
const runnerSubscription =	disposable.adopt(
	await getRunnerChannel(shard).subscribe(),
	subscription => subscription.disconnect());
const maxConcurrency = config.runner.sandbox === 'unsafe' ? 1 : config.runner.concurrency;
const { migrationTimeout } = config.runner;

// Load shared terrain data
const world = await shard.loadWorld();
loadTerrain(world); // pathfinder

// Persistent player instances
const playerInstances = disposable.adopt(
	new Map<string, PlayerInstance>(),
	playerInstances => playerInstances.values().forEach(instance => instance.disconnect()));

// Start the runner loop
const runnerMessages = runnerSubscription.iterable();
await getServiceChannel(shard).publish({ type: 'runnerConnected' });
loop: for await (const message of Async.breakable(runnerMessages, breaker => break1 = breaker)) {
	switch (message.type) {
		case 'shutdown':
			break loop;

		case 'run': {
			// Set up metadata and iterators for this tick
			const { time } = message;
			if (isEntry) {
				process.stderr.write(`Tick ${time}: `);
			}
			const seen = new Set<string>();
			const affinity = [ ...playerInstances.keys() ];
			const key = runnerUsersSetKey(time);
			const affinityIterator = Async.breakable(consumeSetMembers(shard.scratch, key, affinity), breaker => break2 = breaker);
			const fallbackIterator = Async.breakable(consumeSet(shard.scratch, key), breaker => break3 = breaker);
			// eslint-disable-next-line require-yield
			const pauseIfMoreRemain = async function*() {
				if (migrationTimeout > 0) {
					const [ cancel, tickFinished ] = getServiceChannel(shard).listenFor(message =>
						message.type === 'tickFinished' && message.time === time);
					const count = await shard.scratch.scard(key);
					if (count > 0) {
						// This will insert a configurable timeout before taking on new player sandboxes
						const timeout = Timers.setTimeout(migrationTimeout);
						await Promise.race([ tickFinished, timeout ]);
					}
					cancel();
				}
			}();
			// Run player code
			await Fn.pipe(
				Fn.concatAsync([ Fn.lookAhead(affinityIterator, 1), pauseIfMoreRemain, fallbackIterator ]),
				$$ => Fn.divide($$, maxConcurrency),
				$$ => Fn.mapAwait($$, async userIds => {
					for await (const userId of userIds) {
						// Get or create player instance
						seen.add(userId);
						const instance = playerInstances.get(userId) ?? await async function() {
							const instance = await PlayerInstance.create(shard, world, userId);
							playerInstances.set(userId, instance);
							return instance;
						}();

						// Run user code
						const [ intentRooms, visibleRooms ] = await Promise.all([
							shard.scratch.smembers(userToIntentRoomsSetKey(userId)),
							shard.scratch.smembers(userToVisibleRoomsSetKey(userId)),
						]);
						if (intentRooms.length === 0) {
							await shard.scratch.srem('activeUsers', [ userId ]);
						} else {
							log(`+${instance.username}, `);
							await instance.run(time, visibleRooms, intentRooms);
							log(`-${instance.username}, `);
						}
					}
				}));

			// Throwaway migrated player sandboxes
			for (const [ userId, instance ] of playerInstances) {
				if (!seen.has(userId)) {
					playerInstances.delete(userId);
					instance.disconnect();
				}
			}
			log('ran\n');
			break;
		}
	}
}
