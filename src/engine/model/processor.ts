import type { RoomIntentPayload } from 'xxscreeps/processor';
import type { Shard } from './shard';
import * as Fn from 'xxscreeps/utility/functional';
import { Channel } from 'xxscreeps/storage/channel';
import { getServiceChannel } from 'xxscreeps/engine/service';

export function getProcessorChannel(shard: Shard) {
	type Message =
		{ type: 'shutdown' } |
		{ type: 'process'; time: number } |
		{ type: 'finalize'; time: number };
	return new Channel<Message>(shard.pubsub, 'channel/processor');
}

const activeRoomsKey = 'processor/activeRooms';
const sleepingRoomsKey = 'processor/inactiveRooms';
export const roomToUsersSetKey = (roomName: string) =>
	`rooms/${roomName}/users`;
export const userToRoomsSetKey = (userId: string) =>
	`users/${userId}/rooms`;

export const processRoomsSetKey = (time: number) =>
	`tick${time % 2}/processRooms`;
export const finalizeRoomsSetKey = (time: number) =>
	`tick${time % 2}/finalizeRooms`;
const processRoomsPendingKey = (time: number) =>
	`tick${time % 2}/processRoomsPending`;
const finalizedRoomsPendingKey = (time: number) =>
	`tick${time % 2}/finalizedRoomsPending`;
const intentsListForRoomKey = (time: number, roomName: string) =>
	`tick${time % 2}/rooms/${roomName}/intents`;

async function pushIntentsForRoom(shard: Shard, roomName: string, userId: string, time: number, intents?: RoomIntentPayload) {
	return intents && shard.scratch.rpush(intentsListForRoomKey(time, roomName), [ JSON.stringify({ userId, intents }) ]);
}

export function pushIntentsForRoomNextTick(shard: Shard, roomName: string, userId: string, intents: RoomIntentPayload) {
	const time = shard.time + 2;
	return Promise.all([
		// Add this room to the active set
		forceRoomProcess(shard, roomName),
		// Save intents
		pushIntentsForRoom(shard, roomName, userId, time, intents),
	]);
}

export async function publishRunnerIntentsForRoom(shard: Shard, userId: string, roomName: string, time: number, intents?: RoomIntentPayload) {
	const [ count ] = await Promise.all([
		// Decrement count of users that this room is waiting for
		shard.scratch.zincrBy(processRoomsSetKey(time), -1, roomName),
		// Add intents to list
		pushIntentsForRoom(shard, roomName, userId, time, intents),
	]);
	if (count === 0) {
		// Publish process task to workers
		await getProcessorChannel(shard).publish({ type: 'process', time });
	}
}

export async function acquireIntentsForRoom(shard: Shard, roomName: string, time: number) {
	const payloads = await shard.scratch.lpop(intentsListForRoomKey(time, roomName), -1);
	return payloads.map(json => {
		const value: { userId: string; intents: RoomIntentPayload } = JSON.parse(json);
		return value;
	});
}

export async function begetRoomProcessQueue(shard: Shard, currentTime: number, time: number) {
	if (
		currentTime < time &&
		await shard.scratch.set('processor/time', time, 'get') !== String(time)
	) {
		const count = await shard.scratch.zcard(activeRoomsKey);
		await Promise.all([
			shard.scratch.zunionStore(processRoomsSetKey(time), [ activeRoomsKey, processRoomsSetKey(time) ]),
			shard.scratch.incrBy(processRoomsPendingKey(time), count),
			getProcessorChannel(shard).publish({ type: 'process', time }),
		]);
	}
	return time;
}

export async function roomDidProcess(shard: Shard, roomName: string, time: number) {
	const [ count ] = await Promise.all([
		// Decrement count of remaining rooms to process
		shard.scratch.decr(processRoomsPendingKey(time)),
		// Add this room to finalization set
		shard.scratch.sadd(finalizeRoomsSetKey(time), [ roomName ]),
	]);
	if (count === 0) {
		// Save total count of finalization set
		const [ finalizeCount ] = await Promise.all([
			shard.scratch.scard(finalizeRoomsSetKey(time)),
			shard.scratch.del(finalizeRoomsSetKey(time)),
		]);
		await shard.scratch.set(finalizedRoomsPendingKey(time), finalizeCount);
		// Publish finalization task to workers
		await getProcessorChannel(shard).publish({ type: 'finalize', time });
	}
}

export async function roomsDidFinalize(shard: Shard, roomsCount: number, time: number) {
	// Decrement number of finalization rooms remain
	const remaining = await shard.scratch.decrBy(finalizedRoomsPendingKey(time), roomsCount);
	if (remaining === 0) {
		return getServiceChannel(shard).publish({ type: 'tickFinished' });
	}
}

export async function updateUserRoomRelationships(shard: Shard, roomName: string, userIds: Set<string>) {
	const toUsersKey = roomToUsersSetKey(roomName);
	const dbUsers = await shard.scratch.smembers(toUsersKey);
	// Remove NPCs
	const playerIds = [ ...Fn.reject(userIds, id => id.length <= 2) ];
	await Promise.all([
		// Mark user active for runner
		// TODO: Probably want to do this another way
		shard.scratch.sadd('users', playerIds),
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
	return shard.scratch.zincrBy(activeRoomsKey, 0, roomName);
}

export function sleepRoomUntil(shard: Shard, roomName: string, time: number, wakeTime: number) {
	return Promise.all([
		// Copy current room state to buffer0 and buffer1
		shard.copyRoomFromPreviousTick(roomName, time + 1),
		// Remove from active room set
		shard.scratch.zrem(activeRoomsKey, [ roomName ]),
		// Set alarm to wake up
		wakeTime === Infinity ? undefined :
			shard.scratch.zadd(sleepingRoomsKey, [ [ wakeTime, roomName ] ]),
	]);
}
