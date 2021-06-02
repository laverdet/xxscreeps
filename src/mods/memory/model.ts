import type { Shard } from 'xxscreeps/engine/db';
import { isValidSegmentId, kMaxMemoryLength, kMaxMemorySegmentLength } from './memory';

const kMaxMemorySize = kMaxMemoryLength * 2;
const kMaxMemorySegmentSize = kMaxMemorySegmentLength * 2;

export function loadUserMemoryBlob(shard: Shard, user: string) {
	return shard.blob.getBuffer(`user/${user}/memory`);
}

export function saveMemoryBlob(shard: Shard, userId: string, blob: Readonly<Uint8Array>) {
	if (blob.byteLength < kMaxMemorySize) {
		return shard.blob.set(`user/${userId}/memory`, blob);
	}
}

export function loadMemorySegmentBlob(shard: Shard, userId: string, segmentId: number) {
	return shard.blob.getBuffer(`user/${userId}/segment${segmentId}`);
}

export async function saveMemorySegmentBlob(shard: Shard, userId: string, segmentId: number, blob: Readonly<Uint8Array> | null) {
	if (isValidSegmentId(segmentId)) {
		const key = `user/${userId}/segment${segmentId}`;
		if (blob === null || blob.byteLength === 0) {
			await shard.blob.del(key);
		} else if (blob.byteLength <= kMaxMemorySegmentSize) {
			return shard.blob.set(key, blob);
		}
	}
}
