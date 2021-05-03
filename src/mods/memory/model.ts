import type { Shard } from 'xxscreeps/engine/model/shard';

export function loadUserMemoryBlob(shard: Shard, user: string) {
	return shard.blob.getBuffer(`memory/${user}`);
}

export function saveUserMemoryBlobForNextTick(shard: Shard, userId: string, blob: Readonly<Uint8Array>) {
	return shard.blob.set(`memory/${userId}`, blob);
}
