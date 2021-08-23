import type { Shard } from 'xxscreeps/engine/db';
import { typedArrayToString } from 'xxscreeps/utility/string';
import { isValidSegmentId, kMaxMemoryLength, kMaxMemorySegmentLength } from './memory';

const kMaxMemorySize = kMaxMemoryLength * 2;
const kMaxMemorySegmentSize = kMaxMemorySegmentLength * 2;

export function loadUserMemoryBlob(shard: Shard, user: string) {
	return shard.data.get(`user/${user}/memory`, { blob: true });
}

export async function loadUserMemoryString(shard: Shard, user: string) {
	const blob = await loadUserMemoryBlob(shard, user);
	return blob && typedArrayToString(new Uint16Array(blob.buffer, 0, blob.length >>> 1));
}

export function saveMemoryBlob(shard: Shard, userId: string, blob: Readonly<Uint8Array>) {
	if (blob.byteLength < kMaxMemorySize) {
		return shard.data.set(`user/${userId}/memory`, blob, { retain: true });
	}
}

export function loadMemorySegmentBlob(shard: Shard, userId: string, segmentId: number) {
	return shard.data.get(`user/${userId}/segment${segmentId}`, { blob: true });
}

export async function saveMemorySegmentBlob(shard: Shard, userId: string, segmentId: number, blob: Readonly<Uint8Array> | null) {
	if (isValidSegmentId(segmentId)) {
		const key = `user/${userId}/segment${segmentId}`;
		if (blob === null || blob.byteLength === 0) {
			await shard.data.del(key);
		} else if (blob.byteLength <= kMaxMemorySegmentSize) {
			return shard.data.set(key, blob);
		}
	}
}
