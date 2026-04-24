import type { Shard } from 'xxscreeps/engine/db/index.js';
import { Channel } from 'xxscreeps/engine/db/channel.js';
import * as User from 'xxscreeps/engine/db/user/index.js';
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

type PublicSegmentMessage =
	{ type: 'segment'; id: number } |
	{ type: 'publicSet' };

export function getPublicSegmentChannel(shard: Shard, userId: string) {
	return new Channel<PublicSegmentMessage>(shard.pubsub, `user/${userId}/publicSegments`);
}

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
			await shard.data.vdel(key);
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
		await shard.data.vdel(key);
	} else {
		await shard.data.set(key, String(id));
	}
}

function activeForeignSegmentKey(userId: string) {
	return `user/${userId}/activeForeignSegment`;
}

export async function loadActiveForeignSegment(shard: Shard, userId: string): Promise<StoredForeignSegmentRequest | null> {
	const fields = await shard.data.hgetall(activeForeignSegmentKey(userId));
	const { username, userId: storedUserId, segmentId } = fields;
	if (!username || !storedUserId || !segmentId) {
		return null;
	}
	return { username, userId: storedUserId, segmentId: Number(segmentId) };
}

// Resolves a player-supplied request (username + optional id) against the prior stored request, the
// target's user record, and the target's `defaultPublicSegment`, then writes the result. Mirrors
// vanilla's users-doc merge: reuses the cached `userId` when the caller repeats a username with an
// explicit id, else looks up by name and falls back to the target's default. Returns `null` when
// resolution fails (unknown username, no default) and also clears any prior stored request so a
// failed request doesn't silently keep reading a previously-active foreign segment.
export async function saveActiveForeignSegment(
	shard: Shard,
	userId: string,
	prior: StoredForeignSegmentRequest | null,
	request: ForeignSegmentRequest | null,
): Promise<StoredForeignSegmentRequest | null> {
	const key = activeForeignSegmentKey(userId);
	if (request === null) {
		await shard.data.del(key);
		return null;
	}
	let resolved: StoredForeignSegmentRequest;
	if (prior?.username === request.username && request.id !== undefined) {
		resolved = { username: request.username, userId: prior.userId, segmentId: request.id };
	} else {
		const targetUserId = await User.findUserByName(shard.db, request.username);
		if (targetUserId === null) {
			await shard.data.del(key);
			return null;
		}
		const segmentId = request.id ?? await loadDefaultPublicSegment(shard, targetUserId);
		if (segmentId === null) {
			await shard.data.del(key);
			return null;
		}
		resolved = { username: request.username, userId: targetUserId, segmentId };
	}
	await shard.data.hmset(key, {
		username: resolved.username,
		userId: resolved.userId,
		segmentId: String(resolved.segmentId),
	});
	return resolved;
}

function publicSegmentsKey(userId: string) {
	return `user/${userId}/publicSegments`;
}

export async function savePublicSegments(shard: Shard, userId: string, ids: number[]) {
	const key = publicSegmentsKey(userId);
	const members = Fn.pipe(
		ids,
		$$ => Fn.filter($$, isValidSegmentId),
		$$ => new Set($$),
		$$ => Fn.map($$, String),
		$$ => [ ...$$ ]);
	if (members.length === 0) {
		await shard.data.del(key);
	} else {
		await Promise.all([
			shard.data.del(key),
			shard.data.sadd(key, members),
		]);
	}
}

export function isPublicSegment(shard: Shard, userId: string, id: number) {
	return shard.data.sismember(publicSegmentsKey(userId), String(id));
}
