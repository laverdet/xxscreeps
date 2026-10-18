import type { Shard } from 'xxscreeps/engine/db/shard.js';

// Room name to the number of spawns the user owns there. A count rather than a set, so a spawn
// removed beside a surviving one keeps the room, and two removed in one flush need no survivor scan.
const spawnRoomsKey = (userId: string) => `user/${userId}/spawnRooms`;

export function insertSpawn(shard: Shard, userId: string, roomName: string): Promise<unknown> {
	return shard.scratch.hincrBy(spawnRoomsKey(userId), roomName, 1);
}

export function removeSpawn(shard: Shard, userId: string, roomName: string): Promise<unknown> {
	return shard.scratch.hincrBy(spawnRoomsKey(userId), roomName, -1);
}

export function refreshSpawns(shard: Shard, userId: string, roomName: string, count: number): Promise<unknown> {
	return shard.scratch.hSet(spawnRoomsKey(userId), roomName, count);
}

/**
 * True when the user owns a spawn in any of `roomNames`.
 */
export async function hasSpawnIn(shard: Shard, userId: string, roomNames: string[]) {
	if (roomNames.length === 0) {
		return false;
	}
	const counts = await shard.scratch.hmGet(spawnRoomsKey(userId), roomNames);
	return Object.values(counts).some(count => Number(count) > 0);
}
