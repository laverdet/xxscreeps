import type { ProcessorRequest } from 'xxscreeps/engine/processor/worker';
import config from 'xxscreeps/config';
import * as Fn from 'xxscreeps/utility/functional';
import { begetRoomProcessQueue, getProcessorChannel, processRoomsSetKey } from 'xxscreeps/engine/processor/model';
import { Database, Shard } from 'xxscreeps/engine/db';
import { consumeSet, consumeSortedSet, consumeSortedSetMembers } from 'xxscreeps/engine/db/async';
import { lookAhead } from 'xxscreeps/utility/async';
import { negotiateResponderClient } from 'xxscreeps/utility/responder';
import { getServiceChannel } from '.';

// Connect to main & storage
const db = await Database.connect();
const shard = await Shard.connect(db, 'shard0');
const worldBlob = await shard.blob.reqBuffer('terrain');
const processorSubscription = await getProcessorChannel(shard).subscribe();
try {

	// Create processor workers
	const userCount = Number(await db.data.scard('users')) - 3; // minus Invader, Source Keeper, Screeps
	const singleThreaded = config.launcher?.singleThreaded;
	const processorCount = singleThreaded ? 1 : Math.min(config.processor.concurrency, Math.ceil(userCount / 2));
	const threads = await Promise.all(Fn.map(Fn.range(processorCount), () =>
		negotiateResponderClient<ProcessorRequest>('xxscreeps/engine/processor/worker.js', singleThreaded)));

	// Initialize workers and rooms
	await Promise.all(Fn.map(threads, async({ responder }) => {
		await responder({ type: 'world', worldBlob });
		for await (const roomName of consumeSet(shard.scratch, 'initializeRooms')) {
			await responder({ type: 'initialize', roomName });
		}
	}));

	// Wait for initialization signal from main
	const [ firstTime ] = await Promise.all([
		async function() {
			for await (const message of processorSubscription) {
				if (message.type === 'shutdown') {
					throw new Error('Processor initialization failure');
				} else if (message.type === 'process') {
					return message.time;
				}
			}
			throw new Error('End of message stream');
		}(),
		getServiceChannel(shard).publish({ type: 'processorInitialized' }),
	]);

	// Initialize processor queue, or sync up with existing processors
	let currentTime = await begetRoomProcessQueue(shard, firstTime, firstTime - 1);

	// Send message to begin processing, this will be picked up by the loop iteration below
	queueMicrotask(() => void getProcessorChannel(shard).publish({ type: 'process', time: currentTime }));

	// Fan out work to workers
	await Promise.all(Fn.map(threads, async thread => {
		let affinityTime = currentTime;
		let affinity: string[] = [];
		let processed: string[] = [];
		for await (const message of processorSubscription) {
			// eslint-disable-next-line @typescript-eslint/switch-exhaustiveness-check
			switch (message.type) {
				case 'shutdown':
					thread.close();
					return thread.wait();

				case 'process': {
					// Ensure processor time is in sync
					const { time } = message;
					currentTime = await begetRoomProcessQueue(shard, message.time, currentTime);
					if (time !== currentTime) {
						break;
					} else if (affinityTime !== currentTime) {
						// Update affinity set once per tick
						if (affinityTime === currentTime - 1) {
							affinity = processed;
						} else {
							affinity = [];
						}
						affinityTime = currentTime;
						processed = [];
					}

					// Continue processing until the queue is empty. Empty queue may not mean processing is
					// done, it also may mean we're waiting on workers
					const queueKey = processRoomsSetKey(time);
					let ran = true;
					loop: while (ran) {
						ran = false;

						// Check affinity rooms
						for await (const roomName of lookAhead(consumeSortedSetMembers(shard.scratch, queueKey, affinity, 0, 0), 1)) {
							ran = true;
							await thread.responder({ type: 'process', roomName, time });
							processed.push(roomName);
						}

						// Run one non-preferred room, then check affinity rooms again
						// eslint-disable-next-line no-unreachable-loop
						for await (const roomName of consumeSortedSet(shard.scratch, queueKey, 0, 0)) {
							ran = true;
							await thread.responder({ type: 'process', roomName, time });
							processed.push(roomName);
							continue loop;
						}

						// No extra rooms were run. Check to see if there's anything left in the affinity array.
						if (affinity.length === 0) {
							break;
						}
						const scores = await shard.scratch.zmscore(queueKey, affinity);
						affinity = [ ...Fn.map(
							Fn.reject(Fn.range(affinity.length), ii => scores[ii] === null),
							ii => affinity[ii]) ];
						if (affinity.length === 0) {
							break;
						}
					}
					break;
				}

				// Second processing phase. This waits until all player code and first phase processing has
				// run.
				case 'finalize':
					await thread.responder({ type: 'finalize', time: currentTime });
					break;
			}
		}
	}));

} finally {
	processorSubscription.disconnect();
	shard.disconnect();
	db.disconnect();
}
