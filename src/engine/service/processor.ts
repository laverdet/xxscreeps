import type { Effect } from 'xxscreeps/utility/types';
import type { ProcessorRequest } from 'xxscreeps/engine/processor/worker';
import config from 'xxscreeps/config';
import * as Async from 'xxscreeps/utility/async';
import * as Fn from 'xxscreeps/utility/functional';
import { begetRoomProcessQueue, getProcessorChannel, processRoomsSetKey } from 'xxscreeps/engine/processor/model';
import { Database, Shard } from 'xxscreeps/engine/db';
import { consumeSet, consumeSortedSet, consumeSortedSetMembers } from 'xxscreeps/engine/db/async';
import { lookAhead } from 'xxscreeps/utility/async';
import { negotiateResponderClient } from 'xxscreeps/utility/responder';
import { checkIsEntry, getServiceChannel, handleInterrupt } from '.';
const isEntry = checkIsEntry();

// Interrupt handler
let halt: Effect | undefined;
let halted = false as boolean;
let processing = false;
handleInterrupt(() => {
	halted = true;
	if (!processing) {
		halt?.();
	}
});

// Connect to main & storage
const db = await Database.connect();
const shard = await Shard.connect(db, 'shard0');
const worldBlob = await shard.blob.reqBuffer('terrain');
const processorSubscription = await getProcessorChannel(shard).subscribe();

// Create processor workers
const userCount = Number(await db.data.scard('users')) - 3; // minus Invader, Source Keeper, Screeps
const singleThreaded = config.launcher?.singleThreaded;
const processorCount = Math.max(1, singleThreaded ? 1 : Math.min(config.processor.concurrency, Math.ceil(userCount / 2)));
const threads = await Promise.all(Fn.map(Fn.range(processorCount), async() => ({
	info: {
		affinityTime: -1,
		affinity: [] as string[],
		processed: [] as string[],
	},
	thread: await negotiateResponderClient<ProcessorRequest, void>('xxscreeps/engine/processor/worker.js', singleThreaded),
})));

try {

	// Initialize workers and rooms
	await Promise.all(Fn.map(threads, async({ thread }) => {
		await thread.responder({ type: 'world', worldBlob });
		for await (const roomName of consumeSet(shard.scratch, 'initializeRooms')) {
			await thread.responder({ type: 'initialize', roomName });
			if (halted) {
				break;
			}
		}
	}));

	// Wait for initialization signal from main
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
	await getServiceChannel(shard).publish({ type: 'processorInitialized' })
	const firstTime = await waitForSync;

	// Initialize processor queue, or sync up with existing processors
	const processorMessages = processorSubscription.iterable();
	let currentTime = await begetRoomProcessQueue(shard, firstTime, firstTime - 1);

	// Send message to begin processing, this will be picked up by the loop iteration below
	queueMicrotask(() => void getProcessorChannel(shard).publish({ type: 'process', time: currentTime }));

	// Process messages
	loop: for await (const message of Async.breakable(processorMessages, breaker => halt = breaker)) {

		switch (message.type) {
			case 'shutdown':
				break loop;

			case 'process': {
				// Ensure processor time is in sync
				const { time } = message;
				currentTime = await begetRoomProcessQueue(shard, message.time, currentTime);
				if (time !== currentTime) {
					break;
				}

				// Fan out to workers
				processing = true;
				await Promise.all(Fn.map(threads, async({ info, thread }) => {
					if (info.affinityTime !== currentTime) {
						// Update affinity set once per tick
						if (info.affinityTime === currentTime - 1) {
							info.affinity = info.processed;
						} else {
							info.affinity = [];
						}
						info.affinityTime = currentTime;
						info.processed = [];
					}

					// Simple process handler for each room
					async function processRoom(roomName: string, time: number) {
						await thread.responder({ type: 'process', roomName, time });
						info.processed.push(roomName);
						if (isEntry) {
							process.stdout.write(`${roomName}, `);
						}
					}

					// Continue processing until the queue is empty. Empty queue may not mean processing is
					// done, it also may mean we're waiting on workers
					const queueKey = processRoomsSetKey(time);
					let ran = true;
					loop: while (ran) {
						ran = false;

						// Check affinity rooms
						for await (const roomName of lookAhead(consumeSortedSetMembers(shard.scratch, queueKey, info.affinity, 0, 0), 1)) {
							ran = true;
							await processRoom(roomName, time);
						}

						// Run one non-preferred room, then check affinity rooms again
						// eslint-disable-next-line no-unreachable-loop
						for await (const roomName of consumeSortedSet(shard.scratch, queueKey, 0, 0)) {
							ran = true;
							await processRoom(roomName, time);
							continue loop;
						}

						// No extra rooms were run. Check to see if there's anything left in the affinity array.
						if (info.affinity.length === 0) {
							break;
						}
						const scores = await shard.scratch.zmscore(queueKey, info.affinity);
						info.affinity = [ ...Fn.map(
							Fn.reject(Fn.range(info.affinity.length), ii => scores[ii] === null),
							ii => info.affinity[ii]) ];
						if (info.affinity.length === 0) {
							break;
						}
					}
				}));
				break;
			}

			// Second processing phase. This waits until all player code and first phase processing has
			// run.
			case 'finalize':
				await Promise.all(Fn.map(threads, async({ thread }) =>
					thread.responder({ type: 'finalize', time: currentTime })));
				processing = false;
				if (isEntry) {
					console.log(`...completed tick ${currentTime}`);
				}
				if (halted) {
					// We check for interrupts at the end of tick
					break loop;
				}
				break;
		}
	}

} finally {
	// Close workers
	await Promise.all(Fn.map(threads, async({ thread }) => {
		thread.close();
		return thread.wait();
	}));

	// Close connections
	processorSubscription.disconnect();
	shard.disconnect();
	db.disconnect();
}
