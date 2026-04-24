import type { ForeignSegmentPayload, SegmentPayload, flush } from './memory.js';
import type { ForeignSegmentRequest, StoredForeignSegmentRequest } from './model.js';
import type { Effect } from 'xxscreeps/utility/types.js';
import { hooks } from 'xxscreeps/engine/runner/index.js';
import { Fn } from 'xxscreeps/functional/fn.js';
import { kMaxActiveSegments } from './memory.js';
import { getPublicSegmentChannel, isPublicSegment, loadActiveForeignSegment, loadMemorySegmentBlob, loadUserMemoryBlob, saveActiveForeignSegment, saveDefaultPublicSegment, saveMemoryBlob, saveMemorySegmentBlob, savePublicSegments } from './model.js';

declare module 'xxscreeps/engine/runner/index.js' {
	interface InitializationPayload {
		memoryBlob: Readonly<Uint8Array> | null;
	}
	interface TickPayload {
		memorySegments?: SegmentPayload[];
		// Tri-state: `undefined` = no change, `null` = clear, object = install
		foreignSegment?: ForeignSegmentPayload | null;
	}
	interface TickResult {
		activeSegmentsRequest: number[] | null;
		foreignSegmentRequest: ForeignSegmentRequest | null | undefined;
		memorySegmentsUpdated: SegmentPayload[] | null;
		memoryUpdated: ReturnType<typeof flush>;
		defaultPublicSegmentUpdate: number | null | undefined;
		publicSegmentsUpdate: number[] | undefined;
	}
}

hooks.register('runnerConnector', player => {
	const { shard, userId } = player;
	let activeSegments: Set<number>;
	let nextSegments: Set<number> | undefined;
	let activeForeignSegment: StoredForeignSegmentRequest | null = null;
	let subscribedUserId: string | null = null;
	let subscriptionEffect: Effect | undefined;
	let foreignDirty = false;

	async function syncForeignSubscription() {
		const target = activeForeignSegment?.userId ?? null;
		if (target === subscribedUserId) {
			return;
		}
		subscriptionEffect?.();
		subscriptionEffect = undefined;
		subscribedUserId = target;
		foreignDirty = true;
		if (target !== null) {
			const subscription = await getPublicSegmentChannel(shard, target).subscribe();
			subscription.listen(message => {
				if (message.type === 'publicSet' || message.id === activeForeignSegment?.segmentId) {
					foreignDirty = true;
				}
			});
			subscriptionEffect = () => subscription.disconnect();
		}
	}

	return [ () => subscriptionEffect?.(), {
		async initialize(payload) {
			activeSegments = new Set();
			nextSegments = undefined;
			activeForeignSegment = await loadActiveForeignSegment(shard, userId);
			await syncForeignSubscription();
			payload.memoryBlob = await loadUserMemoryBlob(shard, userId);
		},

		async refresh(payload) {
			// Send any newly-requested memory segments
			if (nextSegments) {
				payload.memorySegments = await Promise.all(Fn.map(
					Fn.reject(nextSegments, id => activeSegments.has(id)),
					async id => ({
						id,
						payload: await loadMemorySegmentBlob(shard, userId, id),
					}),
				));
				activeSegments = nextSegments;
				nextSegments = undefined;
			}
			// Only refetch and push to the runtime when the publisher notified us (or on target
			// change). Otherwise the runtime holds last tick's payload and doesn't recreate the
			// lazy-getter object.
			if (foreignDirty) {
				foreignDirty = false;
				if (activeForeignSegment) {
					const { username, userId: targetUserId, segmentId } = activeForeignSegment;
					const [ isPublic, blob ] = await Promise.all([
						isPublicSegment(shard, targetUserId, segmentId),
						loadMemorySegmentBlob(shard, targetUserId, segmentId),
					]);
					payload.foreignSegment = isPublic && blob !== null
						? { username, id: segmentId, bytes: blob }
						: null;
				} else {
					payload.foreignSegment = null;
				}
			}
		},

		async save(payload) {
			// Update active segments
			if (payload.activeSegmentsRequest) {
				nextSegments = new Set(Fn.take(payload.activeSegmentsRequest, kMaxActiveSegments));
			}

			const foreignRequest = payload.foreignSegmentRequest;
			const segmentWrites = payload.memorySegmentsUpdated
				? [ ...Fn.take(payload.memorySegmentsUpdated, kMaxActiveSegments) ]
				: [];
			const publicSegmentsChanged = payload.publicSegmentsUpdate !== undefined;
			const channel = getPublicSegmentChannel(shard, userId);

			await Promise.all([
				// Save primary memory blob
				payload.memoryUpdated.payload && saveMemoryBlob(shard, userId, payload.memoryUpdated.payload),
				// Save memory segments
				...Fn.map(segmentWrites, segment => saveMemorySegmentBlob(shard, userId, segment.id, segment.payload)),
				// Save default public segment
				payload.defaultPublicSegmentUpdate !== undefined
					&& saveDefaultPublicSegment(shard, userId, payload.defaultPublicSegmentUpdate),
				// Save public segment set
				publicSegmentsChanged && savePublicSegments(shard, userId, payload.publicSegmentsUpdate!),
				// Notify foreign readers alongside the writes — reads are tick-synchronized, so no
				// race. Segment updates fire per-id; public-set changes fire once.
				...Fn.map(segmentWrites, segment => channel.publish({ type: 'segment', id: segment.id })),
				publicSegmentsChanged && channel.publish({ type: 'publicSet' }),
				// Resolve + persist the foreign-segment request, then re-subscribe. These are
				// serial; wrap in an IIFE so the rest of the Promise.all runs in parallel.
				foreignRequest !== undefined && async function() {
					activeForeignSegment = await saveActiveForeignSegment(shard, userId, activeForeignSegment, foreignRequest);
					await syncForeignSubscription();
				}(),
			]);
		},
	} ];
});
