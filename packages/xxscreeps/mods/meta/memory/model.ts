import type { Shard } from 'xxscreeps/engine/db/index.js';
import { Channel } from 'xxscreeps/engine/db/channel.js';
import { Fn } from 'xxscreeps/functional/fn.js';
import { typedArrayToString } from 'xxscreeps/utility/string.js';
import { isValidSegmentId, kMaxMemoryLength, kMaxMemorySegmentLength } from './memory.js';

const kMaxMemorySize = kMaxMemoryLength * 2;
const kMaxMemorySegmentSize = kMaxMemorySegmentLength * 2;

export type ForeignSegmentRequest = {
	id: number | undefined;
	username: string;
};

export type StoredForeignSegmentRequest = {
	username: string;
	userId: string;
	segmentId: number;
};

export type PublicSegmentChannel = Channel<
	{ type: 'segment'; id: number } |
	{ type: 'publicSet'; ids: number[] }
>;

export const publicSegmentChannel = (shard: Shard, userId: string): PublicSegmentChannel =>
	new Channel(shard.pubsub, `user/${userId}/publicSegments`);

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

export function deleteUserMemoryBlob(shard: Shard, userId: string) {
	return shard.data.vDel(`user/${userId}/memory`);
}

const memorySegmentKey = (userId: string, segmentId: number) => `user/${userId}/segments/${segmentId}`;

export function loadMemorySegmentBlob(shard: Shard, userId: string, segmentId: number) {
	return shard.data.get(memorySegmentKey(userId, segmentId), { blob: true });
}

// nb: It doesn't publish to the channel, since the player's own driver is subscribed to that
// channel. The consumer of this API needs to publish updates.
export async function saveMemorySegmentBlob(shard: Shard, userId: string, segmentId: number, blob: Readonly<Uint8Array> | null) {
	if (isValidSegmentId(segmentId)) {
		const key = memorySegmentKey(userId, segmentId);
		if (blob === null || blob.byteLength === 0) {
			return shard.data.vDel(key);
		} else if (blob.byteLength <= kMaxMemorySegmentSize) {
			return shard.data.set(key, blob);
		}
	}
}

function defaultPublicSegmentKey(userId: string) {
	return `user/${userId}/defaultPublicSegment`;
}

export async function loadDefaultPublicSegment(shard: Shard, userId: string): Promise<number | null> {
	const raw = await shard.data.get(defaultPublicSegmentKey(userId));
	return raw === null ? null : Number(raw);
}

export async function saveDefaultPublicSegment(shard: Shard, userId: string, id: number | null) {
	const key = defaultPublicSegmentKey(userId);
	if (id === null) {
		await shard.data.vDel(key);
	} else {
		await shard.data.set(key, String(id));
	}
}

function publicSegmentsKey(userId: string) {
	return `user/${userId}/publicSegments`;
}

export async function savePublicSegments(shard: Shard, userId: string, ids: number[]) {
	const channel = publicSegmentChannel(shard, userId);
	const key = publicSegmentsKey(userId);
	const validIds = Fn.pipe(
		ids,
		$$ => Fn.filter($$, isValidSegmentId),
		$$ => new Set($$));
	if (validIds.size === 0) {
		await Promise.all([
			shard.data.vDel(key),
			channel.publish({ type: 'publicSet', ids: [] }),
		]);
	} else {
		await Promise.all([
			shard.data.vDel(key),
			shard.data.sAdd(key, [ ...Fn.map(validIds, String) ]),
			channel.publish({ type: 'publicSet', ids: [ ...validIds ] }),
		]);
	}
}

export function isPublicSegment(shard: Shard, userId: string, id: number) {
	return shard.data.sIsMember(publicSegmentsKey(userId), String(id));
}
