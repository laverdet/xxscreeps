import type { Shard } from './shard';
import type { RoomIntentPayload } from 'xxscreeps/processor';
import { stringToBuffer16, typedArrayToString } from 'xxscreeps/utility/string';

export async function flushExtraIntentsForRoom(shard: Shard, roomName: string, time: number) {
	const blobs = await shard.storage.ephemeral.lpop(extraIntentsListKey(roomName, time), -1);
	return blobs.map(blob => {
		const uint16 = new Uint16Array(blob.buffer);
		const value: { user: string; intents: RoomIntentPayload } = JSON.parse(typedArrayToString(uint16));
		return value;
	});
}

export async function pushExtraIntentsForRoom(shard: Shard, roomName: string, time: number, user: string, intents: RoomIntentPayload) {
	const blob = stringToBuffer16(JSON.stringify({ user, intents }));
	const uint8 = new Uint8Array(blob.buffer);
	await shard.storage.ephemeral.rpush(extraIntentsListKey(roomName, time), [ uint8 ]);
}

function extraIntentsListKey(roomName: string, time: number) {
	return `intents/${roomName}/backend${time % 2}`;
}

export async function flushRunnerIntentsForRoom(shard: Shard, roomName: string, userId: string): Promise<RoomIntentPayload> {
	const key = intentsBlobKey(roomName, userId);
	const [ intentsBlob ] = await Promise.all([
		shard.storage.ephemeral.getBuffer(key),
		shard.storage.ephemeral.del(key),
	]);
	return JSON.parse(typedArrayToString(new Uint16Array(intentsBlob.buffer)));
}

export function saveRunnerIntentsBlobForRoom(shard: Shard, roomName: string, userId: string, intents: Uint16Array) {
	return shard.storage.ephemeral.set(intentsBlobKey(roomName, userId), new Uint8Array(intents.buffer));
}

function intentsBlobKey(roomName: string, userId: string) {
	return `intents/${roomName}/${userId}`;
}
