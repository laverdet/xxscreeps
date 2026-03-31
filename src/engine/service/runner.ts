import type { Effect } from 'xxscreeps/utility/types.js';
import * as Timers from 'node:timers/promises';
import config from 'xxscreeps/config/index.js';
import { importMods } from 'xxscreeps/config/mods/index.js';
import { loadTerrain } from 'xxscreeps/driver/path-finder.js';
import { consumeSet, consumeSetMembers } from 'xxscreeps/engine/db/async.js';
import { Database, Shard } from 'xxscreeps/engine/db/index.js';
import { publishRunnerIntentsForRooms } from 'xxscreeps/engine/processor/model.js';
import { userToIntentRoomsSetKey, userToVisibleRoomsSetKey } from 'xxscreeps/engine/processor/model.js';
import { PlayerInstance } from 'xxscreeps/engine/runner/instance.js';
import { getRunnerChannel, runnerUsersSetKey } from 'xxscreeps/engine/runner/model.js';
import * as Async from 'xxscreeps/utility/async.js';
import { checkIsEntry, getServiceChannel, handleInterrupt } from './index.js';

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
				const activeTasks = new Set<Promise<void>>();
				const startedUsers = new Map<string, {
					instance?: PlayerInstance;
					intentRooms?: string[];
				}>();
				const abandonedInstances = new Set<PlayerInstance>();
				const stopAdmission = new Async.Deferred<void>();
				let calledLastCall = false as boolean;
				let closeRemaining: Promise<void> | undefined;
				let taskError: unknown;
				const closeUser = async (userId: string, intentRooms: string[]) => {
					if (intentRooms.length === 0) {
						await shard.scratch.srem('activeUsers', [ userId ]);
					} else {
						await publishRunnerIntentsForRooms(shard, userId, time, intentRooms, {}, { force: true });
					}
				};
				const invokeLastCall = () => {
					if (calledLastCall) {
						return;
					}
					calledLastCall = true;
					break2?.();
					break3?.();
					stopAdmission.resolve();
					const closeStarted = Promise.all([ ...startedUsers.entries() ].map(async ([ userId, state ]) => {
						if (state.instance) {
							playerInstances.delete(userId);
							abandonedInstances.add(state.instance);
							state.instance.abortTick(time);
						}
						await closeUser(userId, state.intentRooms ?? await shard.scratch.smembers(userToIntentRoomsSetKey(userId)));
					}));
					const closePending = (async () => {
						const pendingUsers = await shard.scratch.smembers(key);
						await shard.scratch.vdel(key);
						await Promise.all(pendingUsers.map(async userId => {
							seen.add(userId);
							await closeUser(userId, await shard.scratch.smembers(userToIntentRoomsSetKey(userId)));
						}));
					})();
					closeRemaining = Promise.all([ closeStarted, closePending ]).then(() => {});
				};
				const recordTaskError = (error: unknown) => {
					if (taskError === undefined) {
						taskError = error;
						break2?.();
						break3?.();
						stopAdmission.resolve();
					} else {
						console.error(error);
					}
				};
				const waitForCapacity = async () => {
					while (!calledLastCall && inFlightTasks.size >= maxConcurrency) {
						await Promise.race([ stopAdmission.promise, ...inFlightTasks ]);
						if (taskError !== undefined) {
							throw taskError;
						}
					}
				};
				const waitForTask = async () => {
					if (activeTasks.size === 0) {
						return;
					}
					await Promise.race([ stopAdmission.promise, ...activeTasks ]);
					if (taskError !== undefined) {
						throw taskError;
					}
				};
				const [ cancelLastCall, waitForLastCall ] = getServiceChannel(shard).listenFor(message =>
					message.type === 'lastCall' && message.time === time);
				void waitForLastCall.then(invokeLastCall);
				// eslint-disable-next-line require-yield
				const pauseIfMoreRemain = async function*() {
					if (migrationTimeout > 0) {
						const [ cancel, tickFinished ] = getServiceChannel(shard).listenFor(message =>
							message.type === 'tickFinished' && message.time === time);
						const count = await shard.scratch.scard(key);
						if (count > 0) {
							// This will insert a configurable timeout before taking on new player sandboxes
							const timeout = Timers.setTimeout(migrationTimeout);
							await Promise.race([ tickFinished, timeout, stopAdmission.promise ]);
						}
						cancel();
					}
				}();
				// Run player code
				const userQueue = Async.concat(
					affinityIterator,
					pauseIfMoreRemain,
					fallbackIterator,
				);
				const launchUser = (userId: string) => {
					startedUsers.set(userId, {});
					let task!: Promise<void>;
					task = (async() => {
						// Get or create player instance
						seen.add(userId);
						const state = startedUsers.get(userId)!;
						const instance = playerInstances.get(userId) ?? await async function() {
							const instance = await PlayerInstance.create(shard, world, userId);
							playerInstances.set(userId, instance);
							return instance;
						}();
						state.instance = instance;

						// Run user code
						const [ intentRooms, visibleRooms ] = await Promise.all([
							shard.scratch.smembers(userToIntentRoomsSetKey(userId)),
							shard.scratch.smembers(userToVisibleRoomsSetKey(userId)),
						]);
						state.intentRooms = intentRooms;
						if (intentRooms.length === 0) {
							await shard.scratch.srem('activeUsers', [ userId ]);
							return;
						}
						if (calledLastCall) {
							playerInstances.delete(userId);
							abandonedInstances.add(instance);
							await closeUser(userId, intentRooms);
							return;
						}
						if (isEntry) {
							process.stdout.write(`+${instance.username}, `);
						}
						try {
							await instance.run(time, visibleRooms, intentRooms);
						} finally {
							if (isEntry) {
								process.stdout.write(`-${instance.username}, `);
							}
						}
						})().catch(recordTaskError).finally(() => {
							activeTasks.delete(task);
							inFlightTasks.delete(task);
							const state = startedUsers.get(userId);
							startedUsers.delete(userId);
							if (state?.instance && abandonedInstances.delete(state.instance)) {
								state.instance.disconnect();
							}
						});
						activeTasks.add(task);
						inFlightTasks.add(task);
				};
				try {
					for await (const userId of userQueue) {
						await waitForCapacity();
						if (calledLastCall) {
							break;
						}
						launchUser(userId);
					}
					while (!calledLastCall && activeTasks.size > 0) {
						await waitForTask();
					}
				} finally {
					cancelLastCall();
				}
				await closeRemaining;
				if (taskError !== undefined) {
					throw taskError;
				}

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
