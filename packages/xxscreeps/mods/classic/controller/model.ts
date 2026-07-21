import type { Shard } from 'xxscreeps/engine/db/shard.js';
import { Channel } from 'xxscreeps/engine/db/channel.js';
import * as User from 'xxscreeps/engine/db/user/index.js';

export const controlledRoomsKey = (userId: string) => `user/${userId}/controlledRooms`;
export const reservedRoomsKey = (userId: string) => `user/${userId}/reservedRooms`;

export const globalControlChannel =	(shard: Shard, userId: string): GlobalControlChannel =>
	new Channel(shard.pubsub, `user/${userId}/globalControl`);

export type GlobalControlChannel = Channel<
 { type: 'gcl'; gcl: number } |
 { type: 'insertRoom'; roomName: string } |
 { type: 'removeRoom'; roomName: string }
>;

export function insertControlledRoom(shard: Shard, userId: string, roomName: string): Promise<unknown> {
	return Promise.all([
		globalControlChannel(shard, userId).publish({ type: 'insertRoom', roomName }),
		shard.scratch.sAdd(controlledRoomsKey(userId), [ roomName ]),
		shard.scratch.sRem(reservedRoomsKey(userId), [ roomName ]),
	]);
}

export function removeControlledRoom(shard: Shard, userId: string, roomName: string): Promise<unknown> {
	return Promise.all([
		globalControlChannel(shard, userId).publish({ type: 'removeRoom', roomName }),
		shard.scratch.sRem(controlledRoomsKey(userId), [ roomName ]),
	]);
}

export function insertReservedRoom(shard: Shard, userId: string, roomName: string): Promise<unknown> {
	return shard.scratch.sAdd(reservedRoomsKey(userId), [ roomName ]);
}

export function removeReservedRoom(shard: Shard, userId: string, roomName: string): Promise<unknown> {
	return shard.scratch.sRem(reservedRoomsKey(userId), [ roomName ]);
}

export async function incrementGlobalControlLevel(shard: Shard, userId: string, upgradePower: number) {
	const gcl = await shard.db.data.hincrBy(User.infoKey(userId), 'gcl', upgradePower);
	await globalControlChannel(shard, userId).publish({ type: 'gcl', gcl });
}
