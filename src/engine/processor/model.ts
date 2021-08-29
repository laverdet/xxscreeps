import type { Room } from 'xxscreeps/game/room';
import type { RoomIntentPayload, SingleIntent } from 'xxscreeps/engine/processor';
import type { Shard } from 'xxscreeps/engine/db';
import type { flushUsers } from 'xxscreeps/game/room/room';
import * as Fn from 'xxscreeps/utility/functional';
import { Channel } from 'xxscreeps/engine/db/channel';
import { runnerUsersSetKey } from 'xxscreeps/engine/runner/model';
import { getServiceChannel } from 'xxscreeps/engine/service';
import { KeyvalScript } from 'xxscreeps/engine/db/storage/script';

export function getProcessorChannel(shard: Shard) {
	type Message =
		{ type: 'finalize'; time: number } |
		{ type: 'process'; time: number } |
		{ type: 'shutdown' };
	return new Channel<Message>(shard.pubsub, 'channel/processor');
}

export function getRoomChannel(shard: Shard, roomName: string) {
	type Message =
		{ type: 'didUpdate'; time: number } |
		{ type: 'willSpawn' };
	return new Channel<Message>(shard.pubsub, `processor/room/${roomName}`);
}

export const processorTimeKey = 'processor/time';
export const activeRoomsKey = 'processor/activeRooms';
const sleepingRoomsKey = 'processor/inactiveRooms';
export const userToIntentRoomsSetKey = (userId: string) =>
	`users/${userId}/intentRooms`;
export const userToPresenceRoomsSetKey = (userId: string) =>
	`users/${userId}/presenceRooms`;

export const processRoomsSetKey = (time: number) =>
	`tick${time}/processRooms`;
export const finalizeExtraRoomsSetKey = (time: number) =>
	`tick${time}/finalizeExtraRooms`;
const activeRoomsProcessingKey = (time: number) =>
	`tick${time}/processedRooms`;
const processRoomsPendingKey = (time: number) =>
	`tick${time}/processRoomsPending`;
const finalizedRoomsPendingKey = (time: number) =>
	`tick${time}/finalizedRoomsPending`;
const intentsListForRoomKey = (roomName: string) =>
	`rooms/${roomName}/intents`;
const finalIntentsListForRoomKey = (roomName: string) =>
	`rooms/${roomName}/finalIntents`;

const CompareAndSwap = new KeyvalScript((
	keyval,
	[ key ]: [ string, string],
	[ expected, desired ]: [ expected: number | string, desired: number | string ],
) => {
	const current = keyval.get(key);
	if (`${current}` === `${expected}`) {
		keyval.set(key, desired);
		return 1;
	} else {
		return 0;
	}
}, {
	lua:
		`if redis.call('get', KEYS[1]) == ARGV[1] then
			return redis.call('set', KEYS[1], ARGV[2])
		else
			return 0
		end`,
});

const SCardStore = new KeyvalScript(
	(keyval, [ into, from ]: [ string, string ]) => {
		const result = keyval.scard(from);
		keyval.set(into, result);
		return result;
	}, {
		lua:
			`local result = redis.call('scard', KEYS[2])
			redis.call('set', KEYS[1], result)
			return result`,
	},
);

const ZCardStore = new KeyvalScript(
	(keyval, [ into, from ]: [ string, string ]) => {
		const result = keyval.zcard(from);
		keyval.set(into, result);
		return result;
	}, {
		lua:
			`local result = redis.call('zcard', KEYS[2])
			redis.call('set', KEYS[1], result)
			return result`,
	},
);

const ZSetToSet = new KeyvalScript(
	(keyval, [ into, from ]: [string, string]) => keyval.sadd(into, keyval.zrange(from, 0, -1)),
	{
		lua:
			`local members = redis.call('zrange', KEYS[2], 0, -1)
			local result = 0
			for ii = 1, #members, 5000 do
				result = result + redis.call('sadd', KEYS[1], unpack(members, ii, math.min(ii + 4999, #members)))
			end
			return result`,
	});

async function pushIntentsForRoom(shard: Shard, roomName: string, userId: string, intents?: RoomIntentPayload) {
	return intents && shard.scratch.rpush(intentsListForRoomKey(roomName), [ JSON.stringify({ userId, intents }) ]);
}

export function pushIntentsForRoomNextTick(shard: Shard, roomName: string, userId: string, intents: RoomIntentPayload) {
	return Promise.all([
		// Add this room to the active set
		shard.scratch.zadd(sleepingRoomsKey, [ [ shard.time + 1, roomName ] ]),
		// Save intents
		pushIntentsForRoom(shard, roomName, userId, intents),
	]);
}

export async function publishRunnerIntentsForRoom(shard: Shard, userId: string, roomName: string, time: number, intents?: RoomIntentPayload) {
	const [ count ] = await Promise.all([
		// Decrement count of users that this room is waiting for
		shard.scratch.zadd(processRoomsSetKey(time), [ [ -1, roomName ] ], { if: 'xx', incr: true }),
		// Add intents to list
		pushIntentsForRoom(shard, roomName, userId, intents),
	]);
	if (count === null || count > 0) {
		return;
	} else if (count < 0) {
		// Reset count back to 0 in the case we've published intents for an abandoned tick
		// NOTE: These intents will still be processed at some point, which is probably not desired.
		await shard.scratch.zadd(processRoomsSetKey(time), [ [ 0, roomName ] ], { if: 'xx' });
	}
	// Publish process task to workers
	await getProcessorChannel(shard).publish({ type: 'process', time });
}

export async function publishInterRoomIntents(shard: Shard, roomName: string, time: number, intents: SingleIntent[]) {
	const [ count ] = await Promise.all([
		// Mark this room as active for this tick
		shard.scratch.sadd(activeRoomsProcessingKey(time), [ roomName ]),
		// Save intents
		shard.scratch.rpush(finalIntentsListForRoomKey(roomName), [ JSON.stringify(intents) ]),
	]);
	if (count) {
		// Save this room to the set of rooms that need to finalize
		await shard.scratch.sadd(finalizeExtraRoomsSetKey(time), [ roomName ]);
	}
}

export async function acquireIntentsForRoom(shard: Shard, roomName: string) {
	const key = intentsListForRoomKey(roomName);
	const [ payloads ] = await Promise.all([
		shard.scratch.lrange(key, 0, -1),
		shard.scratch.del(key),
	]);
	return payloads.map(json => {
		const value: { userId: string; intents: RoomIntentPayload } = JSON.parse(json);
		return value;
	});
}

export async function acquireFinalIntentsForRoom(shard: Shard, roomName: string) {
	const key = finalIntentsListForRoomKey(roomName);
	const [ payloads ] = await Promise.all([
		shard.scratch.lrange(key, 0, -1),
		shard.scratch.del(key),
	]);
	return payloads.map((json): SingleIntent[] => JSON.parse(json));
}

export async function begetRoomProcessQueue(shard: Shard, time: number, processorTime: number, early?: boolean) {
	if (processorTime > time) {
		// The processor has lagged and is running through old `process` messages
		return processorTime;
	}
	const currentTime = Number(await shard.scratch.get(processorTimeKey));
	if (currentTime === time) {
		// Already in sync
		return time;
	} else if (currentTime !== time - 1) {
		// First iteration of laggy processor
		return currentTime;
	}
	if (await shard.scratch.eval(CompareAndSwap, [ processorTimeKey ], [ time - 1, time ])) {
		// Guarantee atomicity of the following transaction
		await Promise.all([
			shard.scratch.load(ZCardStore),
			shard.scratch.load(ZSetToSet),
		]);

		// Copy active and waking rooms into current processing queue
		const tmpKey = 'processorWakeUp';
		const processSet = processRoomsSetKey(time);
		const [ , count ] = await Promise.all([
			// Save waking rooms to temporary key
			shard.scratch.zrangeStore(tmpKey, sleepingRoomsKey, 0, time, { by: 'score' }),
			// Combine active rooms and waking rooms into current processing queue
			shard.scratch.zunionStore(processSet, [ activeRoomsKey, tmpKey ], { weights: [ 1, 0 ] }),
			// Remove temporary key
			shard.scratch.del(tmpKey),
			// Remove waking rooms from sleeping rooms
			shard.scratch.zremRange(sleepingRoomsKey, 0, time),
			// Initialize counter for rooms that need to be processed
			shard.scratch.eval(ZCardStore, [ processRoomsPendingKey(time), processSet ], []),
			// Copy processing queue into active rooms set
			shard.scratch.eval(ZSetToSet, [ activeRoomsProcessingKey(time), processSet ], []),
		]);
		if (count === 0) {
			// In this case there are *no* rooms to process so we take care to make sure processing
			// doesn't halt.
			// Delete "0" value
			await shard.scratch.del(processRoomsPendingKey(time));
			if (early) {
				// We're invoking the function at the end of the previous queue, and the main loop is not
				// currently ready for the next tick. We'll set the processor time back the way it was so
				// that this code will be invoked again at the start of the next tick.
				await shard.scratch.eval(CompareAndSwap, [ processorTimeKey ], [ time, time - 1 ]);
				return time - 1;
			} else {
				// The current processor tick has started, so we can now send the finished notification.
				await getServiceChannel(shard).publish({ type: 'tickFinished', time });
			}
		}
		return time;
	} else {
		return Number(await shard.scratch.get(processorTimeKey));
	}
}

export async function roomDidProcess(shard: Shard, roomName: string, time: number) {
	// Decrement count of remaining rooms to process
	const count = await shard.scratch.decr(processRoomsPendingKey(time));
	if (count === 0) {
		// Count rooms which need to be finalized
		const roomsKey = activeRoomsProcessingKey(time);
		await shard.scratch.eval(SCardStore, [ finalizedRoomsPendingKey(time), roomsKey ], []);
		await Promise.all([
			// Publish finalization task to workers
			getProcessorChannel(shard).publish({ type: 'finalize', time }),
			// Delete rooms bookkeeping set
			shard.scratch.del(roomsKey),
			// Delete "0" value from scratch
			shard.scratch.del(processRoomsPendingKey(time)),
		]);
	}
}

export async function roomsDidFinalize(shard: Shard, roomsCount: number, time: number) {
	if (roomsCount > 0) {
		// Decrement number of finalization rooms remaining
		const remaining = await shard.scratch.decrBy(finalizedRoomsPendingKey(time), roomsCount);
		if (remaining === 0) {
			const [ nextTime ] = await Promise.all([
				begetRoomProcessQueue(shard, time + 1, time, true),
				// Delete "0" value from scratch
				shard.scratch.del(finalizedRoomsPendingKey(time)),
				getServiceChannel(shard).publish({ type: 'tickFinished', time }),
			]);
			return nextTime;
		}
	}
	return time;
}

export async function updateUserRoomRelationships(shard: Shard, room: Room, previous?: ReturnType<typeof flushUsers>) {
	const checkPlayers = (current: string[], previous?: string[]) => {
		// Filter out NPCs
		const players = [ ...Fn.reject(current, (userId: string) => userId.length <= 2) ];
		// Apply diff
		return previous ? {
			players,
			added: [ ...Fn.reject(players, id => previous.includes(id)) ],
			removed: [ ...Fn.reject(previous, id => players.includes(id)) ],
		} : {
			players,
			added: players,
			removed: [],
		};
	};
	const roomName = room.name;
	const users = room['#users'];
	const intentPlayers = checkPlayers(users.intents, previous?.intents);
	const presencePlayers = checkPlayers(users.presence, previous?.presence);
	await Promise.all([
		// Add intent user associations
		Promise.all(Fn.map(intentPlayers.added, playerId =>
			shard.scratch.sadd(userToIntentRoomsSetKey(playerId), [ roomName ]))),
		// Remove intent user associations
		Promise.all(Fn.map(intentPlayers.removed, playerId =>
			shard.scratch.srem(userToIntentRoomsSetKey(playerId), [ roomName ]))),

		// Add presence user associations
		Promise.all(Fn.map(presencePlayers.added, playerId =>
			shard.scratch.sadd(userToPresenceRoomsSetKey(playerId), [ roomName ]))),
		// Remove presence user associations
		Promise.all(Fn.map(presencePlayers.removed, playerId =>
			shard.scratch.srem(userToPresenceRoomsSetKey(playerId), [ roomName ]))),

		// Mark players active for runner
		shard.scratch.sadd('activeUsers', intentPlayers.added),

		// Update user count in processing queue
		previous && (intentPlayers.added.length + intentPlayers.removed.length) === 0 ? undefined :
		shard.scratch.zadd(activeRoomsKey, [ [ intentPlayers.players.length, roomName ] ]),
	]);
}

export function sleepRoomUntil(shard: Shard, roomName: string, time: number, wakeTime: number) {
	return Promise.all([
		// Copy current room state to buffer0 and buffer1
		shard.copyRoomFromPreviousTick(roomName, time + 1),
		// Remove from active room set
		shard.scratch.zrem(activeRoomsKey, [ roomName ]),
		// Set alarm to wake up
		wakeTime === Infinity ?
			undefined : shard.scratch.zadd(sleepingRoomsKey, [ [ wakeTime, roomName ] ], { if: 'nx' }),
	]);
}

export async function abandonIntentsForTick(shard: Shard, time: number) {
	const key = processRoomsSetKey(time);
	const [ pending ] = await Promise.all([
		// Fetch which rooms we're waiting on, for diagnostics
		shard.scratch.zrange(key, 0, 1000),
		// Update all processor pending counts to 0
		shard.scratch.zinterStore(key, [ key ], { weights: [ 0 ] }),
		// Clear runner queue
		shard.scratch.del(runnerUsersSetKey(time)),
	]);
	// Publish process task to workers
	await getProcessorChannel(shard).publish({ type: 'process', time });
	return pending;
}
