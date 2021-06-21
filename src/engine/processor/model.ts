import type { Room } from 'xxscreeps/game/room';
import type { RoomIntentPayload, SingleIntent } from 'xxscreeps/engine/processor';
import type { Shard } from 'xxscreeps/engine/db';
import * as Fn from 'xxscreeps/utility/functional';
import { Channel } from 'xxscreeps/engine/db/channel';
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
const roomToUsersSetKey = (roomName: string) =>
	`rooms/${roomName}/users`;
export const userToRoomsSetKey = (userId: string) =>
	`users/${userId}/rooms`;

export const processRoomsSetKey = (time: number) =>
	`tick${time}/processRooms`;
export const finalizeExtraRoomsSetKey = (time: number) =>
	`tick${time}/finalizeExtraRooms`;
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
	if (count === 0) {
		// Publish process task to workers
		await getProcessorChannel(shard).publish({ type: 'process', time });
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

export async function begetRoomProcessQueue(shard: Shard, time: number, processorTime: number) {
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
		// Copy active rooms to current processing queue. This can run after runners
		// have already started so it's important that it's resilient to negative
		// numbers already in `processRoomsSetKey`.
		await Promise.all([
			shard.scratch.zunionStore(processRoomsSetKey(time), [ activeRoomsKey, processRoomsSetKey(time) ]),
			shard.scratch.incrBy(processRoomsPendingKey(time), count),
			shard.scratch.incrBy(finalizedRoomsPendingKey(time), count),
		]);
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
				begetRoomProcessQueue(shard, time + 1, time),
				getServiceChannel(shard).publish({ type: 'tickFinished' }),
			]);
			return nextTime;
		}
	}
	return time;
}

export async function updateUserRoomRelationships(shard: Shard, room: Room) {
	const roomName = room.name;
	const toUsersKey = roomToUsersSetKey(roomName);
	// Remove NPCs
	const playerIds = [ ...Fn.reject(room['#users'].intents, id => id.length <= 2) ];
	const dbUsers = await shard.scratch.smembers(toUsersKey);
	await Promise.all([
		// Mark user active for runner
		// TODO: Probably want to do this another way
		shard.scratch.sadd('activeUsers', playerIds),
		// Update user count in processing queue
		shard.scratch.zadd(activeRoomsKey, [ [ playerIds.length, roomName ] ]),
		// Remove users that no longer have access to this room
		Promise.all(Fn.map(
			Fn.reject(dbUsers, id => playerIds.includes(id)),
			id => Promise.all([
				shard.scratch.srem(toUsersKey, [ id ]),
				shard.scratch.srem(userToRoomsSetKey(id), [ roomName ]),
			]),
		)),
		// Add users that should have access to this room
		Promise.all(Fn.map(
			Fn.reject(playerIds, id => dbUsers.includes(id)),
			userId => Promise.all([
				shard.scratch.sadd(toUsersKey, [ userId ]),
				shard.scratch.sadd(userToRoomsSetKey(userId), [ roomName ]),
			]),
		)),
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
