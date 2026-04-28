import type { ProcessorRequest } from 'xxscreeps/engine/processor/worker.js';
import type { Effect } from 'xxscreeps/utility/types.js';
import config from 'xxscreeps/config/index.js';
import { consumeSet, consumeSortedSet, consumeSortedSetMembers } from 'xxscreeps/engine/db/async.js';
import { Database, Shard } from 'xxscreeps/engine/db/index.js';
import { begetRoomProcessQueue, getProcessorChannel, processRoomsSetKey } from 'xxscreeps/engine/processor/model.js';
import { Fn } from 'xxscreeps/functional/fn.js';
import * as Async from 'xxscreeps/utility/async.js';
import { negotiateResponderClient } from 'xxscreeps/utility/responder.js';
import { clamp } from 'xxscreeps/utility/utility.js';
import { handleInterruptSignal } from './signal.js';
import { checkIsEntry, getServiceChannel } from './index.js';

const isEntry = checkIsEntry();
const log = config.processor.log ?? isEntry
	? (message: string) => process.stderr.write(message)
	: () => {};

// Interrupt handler
let halt: Effect | undefined;
let halted = false as boolean;
let processing = false;
using _signal = handleInterruptSignal(() => {
	halted = true;
	if (!processing) {
		halt?.();
	}
});

// Connect to main & storage
await using disposable = new AsyncDisposableStack();
using db = await Database.connect();
using shard = await Shard.connect(db, 'shard0');
const worldBlob = await shard.data.req('terrain', { blob: true });
const processorSubscription =	disposable.adopt(
	await getProcessorChannel(shard).subscribe(),
	subscription => subscription.disconnect());

// Create processor workers
type RoomWorker = typeof workers extends (infer Type)[] ? Type : never;
const userCount = Number(await db.data.scard('users')) - 3; // minus Invader, Source Keeper, Screeps
const singleThreaded = config.launcher?.singleThreaded;
const processorCount = clamp(1, config.processor.concurrency, singleThreaded ? 1 : Math.ceil(userCount / 2));
const workers = await Fn.pipe(
	Fn.range(processorCount),
	$$ => Fn.mapAwait($$, async () => {
		const client = disposable.adopt(
			await negotiateResponderClient<ProcessorRequest, void>('xxscreeps/engine/processor/worker.js', singleThreaded),
			client => {
				client.close();
				return client.wait();
			});
		return {
			...client,
			affinity: [] as string[],
			checkAffinity: true,
			idle: true,
			processed: [] as string[],
		};
	}));
const affinityByRoom = new Map<string, RoomWorker>();

// Pulls rooms from process queue for a given worker. Prioritizes affinity rooms, but will return
// other rooms if needed.
async function *consumeRoomsQueue(worker: RoomWorker, time: number) {
	const queueKey = processRoomsSetKey(time);
	loop: while (true) {

		// Yield affinity rooms first
		while (worker.checkAffinity) {
			const affinityIterator = consumeSortedSetMembers(shard.scratch, queueKey, worker.affinity, 0, 0);
			// eslint-disable-next-line @typescript-eslint/require-await, require-yield
			const endOfAffinity = async function*() {
				worker.checkAffinity = false;
			}();
			const iterators = Fn.concatAsync([ affinityIterator, endOfAffinity ]);
			for await (const roomName of Fn.lookAhead(iterators, 1)) {
				yield roomName;
			}
		}

		// Yield non-affinity rooms until there's no more, or it's time to check affinity again
		for await (const roomName of consumeSortedSet(shard.scratch, queueKey, 0, 0)) {
			yield roomName;
			// nb: eslint ignore is automatically removed
			if (worker.checkAffinity as unknown) {
				continue loop;
			}
		}
		break;
	}
}

// Initialize workers and rooms
await Fn.mapAwait(workers, async worker => {
	await worker.responder({ type: 'world', worldBlob });
	for await (const roomName of consumeSet(shard.scratch, 'initializeRooms')) {
		await worker.responder({ type: 'initialize', roomName });
		if (halted) {
			break;
		}
	}
});

// Wait for initialization signal from main
const processorMessages = processorSubscription.iterable();
const waitForSync = function() {
	const messages = processorSubscription.iterable();
	return async function() {
		for await (const message of Async.breakable(messages, breaker => halt = breaker)) {
			if (message.type === 'shutdown' || halted) {
				throw new Error('Processor initialization failure');
			} else if (message.type === 'process') {
				return message.time;
			}
		}
		throw new Error('End of message stream');
	}();
}();
await getServiceChannel(shard).publish({ type: 'processorInitialized' });
let currentTime = await waitForSync;

// Process messages
loop: for await (const message of Async.breakable(processorMessages, breaker => halt = breaker)) {
	switch (message.type) {
		case 'shutdown':
			break loop;

		case 'process': {
			// Ensure processor time is in sync
			const { time, roomNames } = message;
			currentTime = await begetRoomProcessQueue(shard, message.time, currentTime);
			if (time !== currentTime) {
				break;
			}
			processing = true;

			// Update checkAffinity flag on workers
			let activations = function() {
				if (roomNames) {
					for (const roomName of roomNames) {
						const worker = affinityByRoom.get(roomName);
						if (worker) {
							worker.checkAffinity = true;
						}
					}
					return roomNames.length;
				} else {
					return Infinity;
				}
			}();

			// Activate a worker per room
			for (const worker of workers) {
				if (worker.idle) {
					worker.idle = false;
					Async.mustNotReject(async () => {
						// Continue processing until the queue is empty. Empty queue may not mean processing is
						// done, it also may mean we're waiting on workers
						for await (const roomName of consumeRoomsQueue(worker, time)) {
							worker.processed.push(roomName);
							await worker.responder({ type: 'process', roomName, time });
							log(`${roomName}, `);
						}
						worker.idle = true;
					});
					if (--activations <= 0) {
						break;
					}
				}
			}
			break;
		}

		// Second processing phase. This waits until all player code and first phase processing has
		// run.
		case 'finalize':
			log(`finalized tick ${currentTime}\n`);
			// Run finalization in worker
			await Promise.all(Fn.map(workers, async worker => {
				if (worker.processed.length > 0) {
					await worker.responder({ type: 'finalize', time: currentTime });
				}
			}));
			processing = false;
			if (halted) {
				// We check for interrupts at the end of tick
				break loop;
			}
			// Reset affinity for each worker
			affinityByRoom.clear();
			for (const worker of workers) {
				worker.affinity = worker.processed;
				worker.processed = [];
				for (const roomName of worker.affinity) {
					affinityByRoom.set(roomName, worker);
				}
			}
			break;
	}
}
