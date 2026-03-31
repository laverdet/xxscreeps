import type { Shard } from 'xxscreeps/engine/db/index.js';
import type { Effect } from 'xxscreeps/utility/types.js';
import * as Timers from 'node:timers/promises';
import { consumeSet, consumeSetMembers } from 'xxscreeps/engine/db/async.js';
import { publishRunnerIntentsForRooms } from 'xxscreeps/engine/processor/model.js';
import { userToIntentRoomsSetKey, userToVisibleRoomsSetKey } from 'xxscreeps/engine/processor/model.js';
import { runnerUsersSetKey } from 'xxscreeps/engine/runner/model.js';
import * as Async from 'xxscreeps/utility/async.js';
import { getServiceChannel } from './index.js';

export interface RunnerTickInstance {
	abortTick: (time: number) => void;
	disconnect: () => void;
	run: (time: number, visibleRooms: string[], intentRooms: string[]) => Promise<void>;
	username: string;
}

type RunRunnerTickOptions<Instance extends RunnerTickInstance> = {
	affinityBreaker?: (breaker: Effect) => void;
	createInstance: (userId: string) => Promise<Instance>;
	fallbackBreaker?: (breaker: Effect) => void;
	inFlightTasks: Set<Promise<void>>;
	isEntry: boolean;
	maxConcurrency: number;
	migrationTimeout: number;
	playerInstances: Map<string, Instance>;
	shard: Shard;
	time: number;
};

export async function runRunnerTick<Instance extends RunnerTickInstance>({
	affinityBreaker,
	createInstance,
	fallbackBreaker,
	inFlightTasks,
	isEntry,
	maxConcurrency,
	migrationTimeout,
	playerInstances,
	shard,
	time,
}: RunRunnerTickOptions<Instance>) {
	if (isEntry) {
		process.stdout.write(`Tick ${time}: `);
	}
	const seen = new Set<string>();
	const affinity = [ ...playerInstances.keys() ];
	const key = runnerUsersSetKey(time);
	const affinityIterator = Async.breakable(consumeSetMembers(shard.scratch, key, affinity), breaker => affinityBreaker?.(breaker));
	const fallbackIterator = Async.breakable(consumeSet(shard.scratch, key), breaker => fallbackBreaker?.(breaker));
	const activeTasks = new Set<Promise<void>>();
	const startedUsers = new Map<string, {
		instance?: Instance;
		intentRooms?: string[];
	}>();
	const abandonedInstances = new Set<Instance>();
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
				const timeout = Timers.setTimeout(migrationTimeout);
				await Promise.race([ tickFinished, timeout, stopAdmission.promise ]);
			}
			cancel();
		}
	}();
	const userQueue = Async.concat(
		affinityIterator,
		pauseIfMoreRemain,
		fallbackIterator,
	);
	const launchUser = (userId: string) => {
		startedUsers.set(userId, {});
		let task!: Promise<void>;
		task = (async() => {
			seen.add(userId);
			const state = startedUsers.get(userId)!;
			const instance = playerInstances.get(userId) ?? await createInstance(userId);
			playerInstances.set(userId, instance);
			state.instance = instance;

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

	for (const [ userId, instance ] of playerInstances) {
		if (!seen.has(userId)) {
			playerInstances.delete(userId);
			instance.disconnect();
		}
	}
	if (isEntry) {
		console.log('... done');
	}
}
