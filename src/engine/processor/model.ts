import type { Room } from 'xxscreeps/game/room';
import type { RoomIntentPayload, SingleIntent } from 'xxscreeps/engine/processor';
import type { Shard } from 'xxscreeps/engine/db';
import type { flushUsers } from 'xxscreeps/game/room/room';
import * as Fn from 'xxscreeps/utility/functional';
import { Channel } from 'xxscreeps/engine/db/channel';
import { runnerUsersSetKey } from 'xxscreeps/engine/runner/model';
import { getServiceChannel } from 'xxscreeps/engine/service';

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
const abandonedIntentsKey = (time: number) =>
	`tick${time}/didAbandonIntents`;
const processRoomsPendingKey = (time: number) =>
	`tick${time % 2}/processRoomsPending`;
const finalizedRoomsPendingKey = (time: number) =>
	`tick${time % 2}/finalizedRoomsPending`;
const intentsListForRoomKey = (roomName: string) =>
	`rooms/${roomName}/intents`;
const finalIntentsListForRoomKey = (roomName: string) =>
	`rooms/${roomName}/finalIntents`;

async function pushIntentsForRoom(shard: Shard, roomName: string, userId: string, intents?: RoomIntentPayload) {
	return intents && shard.scratch.rpush(intentsListForRoomKey(roomName), [ JSON.stringify({ userId, intents }) ]);
}

export function pushIntentsForRoomNextTick(shard: Shard, roomName: string, userId: string, intents: RoomIntentPayload) {
	return Promise.all([
		// Add this room to the active set
		forceRoomProcess(shard, roomName),
		// Save intents
		pushIntentsForRoom(shard, roomName, userId, intents),
	]);
}

export async function publishRunnerIntentsForRoom(shard: Shard, userId: string, roomName: string, time: number, intents?: RoomIntentPayload) {
	const [ count ] = await Promise.all([
		// Decrement count of users that this room is waiting for
		shard.scratch.zincrBy(processRoomsSetKey(time), -1, roomName),
		// Add intents to list
		pushIntentsForRoom(shard, roomName, userId, intents),
	]);
	const requestProcessRooms = () => getProcessorChannel(shard).publish({ type: 'process', time });
	if (count === 0) {
		// Publish process task to workers
		await requestProcessRooms();
	} else if (count < 0) {
		// If this runner set the count to -1 then check to see if this tick was abandoned. If so, then
		// set the count back to 0 and republish the process event to processors
		const wasAbandoned = await shard.scratch.get(abandonedIntentsKey(time));
		if (wasAbandoned) {
			await shard.scratch.zadd(processRoomsSetKey(time), [ [ 0, roomName ] ], { if: 'xx' });
			await requestProcessRooms();
		}
	}
}

export async function publishInterRoomIntents(shard: Shard, roomName: string, time: number, intents: SingleIntent[]) {
	const active = await shard.scratch.zscore(activeRoomsKey, roomName) !== null;
	return Promise.all([
		// Add room to finalization set
		active ?
			undefined : shard.scratch.sadd(finalizeExtraRoomsSetKey(time), [ roomName ]),
		// Save intents
		shard.scratch.rpush(finalIntentsListForRoomKey(roomName), [ JSON.stringify(intents) ]),
	]);
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
	if (await shard.scratch.cas(processorTimeKey, time - 1, time)) {
		// Count currently active rooms, fetch rooms to wake this tick
		const [ initialCount, wake ] = await Promise.all([
			shard.scratch.zcard(activeRoomsKey),
			shard.scratch.zrange(sleepingRoomsKey, 0, time, { by: 'score' }),
		]);
		// Send waking rooms to active queue
		let count = initialCount;
		if (wake.length > 0) {
			const [ awoken ] = await Promise.all([
				shard.scratch.zadd(activeRoomsKey, wake.map(roomName => [ 0, roomName ]), { if: 'nx' }),
				shard.scratch.zremRange(sleepingRoomsKey, 0, time),
			]);
			count += awoken;
		}
		if (count === 0) {
			// In this case there are *no* rooms to process so we take care to make sure processing
			// doesn't halt.
			if (early) {
				// We're invoking the function at the end of the previous queue, and the main loop is not
				// currently ready for the next tick. We'll set the processor time back the way it was so
				// that this code will be invoked again at the start of the next tick.
				await shard.scratch.cas(processorTimeKey, time, time - 1);
				return time - 1;
			} else {
				// The current processor tick has started, so we can now send the finished notification.
				await getServiceChannel(shard).publish({ type: 'tickFinished' });
			}
		} else {
			// Copy active rooms to current processing queue. This can run after runners
			// have already started so it's important that it's resilient to negative
			// numbers already in `processRoomsSetKey`.
			await Promise.all([
				shard.scratch.zunionStore(processRoomsSetKey(time), [ activeRoomsKey, processRoomsSetKey(time) ]),
				shard.scratch.incrBy(processRoomsPendingKey(time), count),
				shard.scratch.incrBy(finalizedRoomsPendingKey(time), count),
			]);
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
		// Count all rooms which were woken due to inter-room intents
		const extraCount = await shard.scratch.scard(finalizeExtraRoomsSetKey(time));
		if (extraCount) {
			// Add inter-room intents to total pending count
			await shard.scratch.incrBy(finalizedRoomsPendingKey(time), extraCount);
		}
		// Publish finalization task to workers
		await getProcessorChannel(shard).publish({ type: 'finalize', time });
	}
}

export async function roomsDidFinalize(shard: Shard, roomsCount: number, time: number) {
	if (roomsCount > 0) {
		// Decrement number of finalization rooms remain
		const remaining = await shard.scratch.decrBy(finalizedRoomsPendingKey(time), roomsCount);
		if (remaining === 0) {
			const [ nextTime ] = await Promise.all([
				begetRoomProcessQueue(shard, time + 1, time, true),
				getServiceChannel(shard).publish({ type: 'tickFinished' }),
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

export function forceRoomProcess(shard: Shard, roomName: string) {
	return shard.scratch.zadd(sleepingRoomsKey, [ [ 0, roomName ] ]);
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
		// Mark this tick as abandoned
		shard.scratch.set(abandonedIntentsKey(time), 1),
		// Update all processor pending counts to 0
		shard.scratch.zinterStore(key, [ key ], { weights: [ 0 ] }),
		// Clear runner queue
		shard.scratch.del(runnerUsersSetKey(time)),
	]);
	// Publish process task to workers
	await getProcessorChannel(shard).publish({ type: 'process', time });
	return pending;
}
