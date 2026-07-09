import type { ForeignSegmentPayload, SegmentPayload, flush } from './memory.js';
import type { ForeignSegmentRequest, StoredForeignSegmentRequest } from './model.js';
import type { SubscriptionFor } from 'xxscreeps/engine/db/channel.js';
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
	const dirtySegments = new Set<number>();
	let ownSubscription: SubscriptionFor<ReturnType<typeof getPublicSegmentChannel>> | undefined;
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

	return [ () => {
		subscriptionEffect?.();
		ownSubscription?.disconnect();
	}, {
		async initialize(payload) {
			activeSegments = new Set();
			nextSegments = undefined;
			dirtySegments.clear();
			// The own-channel subscription watches for out-of-band segment writes, e.g. from the
			// memory-segment API endpoint. This runner's own saves publish through this same
			// subscription, so they are not echoed back.
			[ ownSubscription, activeForeignSegment ] = await Promise.all([
				ownSubscription ?? async function() {
					const subscription = await getPublicSegmentChannel(shard, userId).subscribe();
					subscription.listen(message => {
						if (message.type === 'segment' && (activeSegments.has(message.id) || nextSegments?.has(message.id) === true)) {
							dirtySegments.add(message.id);
						}
					});
					return subscription;
				}(),
				loadActiveForeignSegment(shard, userId),
			]);
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
			// Resend active segments written out-of-band since the last tick. A duplicate id from the
			// newly-requested batch above is fine: the runtime applies payloads in order, so this
			// fresher read wins.
			if (dirtySegments.size !== 0) {
				const ids = [ ...Fn.filter(dirtySegments, id => activeSegments.has(id)) ];
				dirtySegments.clear();
				payload.memorySegments = [
					...payload.memorySegments ?? [],
					...await Fn.mapAwait(ids, async id => ({
						id,
						payload: await loadMemorySegmentBlob(shard, userId, id),
					})),
				];
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

			// Dispatch updates. Publishing through our own subscription keeps these saves from echoing
			// back into the out-of-band listener above.
			const channel = ownSubscription!;
			await Promise.all([
				// Save primary memory blob
				payload.memoryUpdated.payload && saveMemoryBlob(shard, userId, payload.memoryUpdated.payload),

				// Save memory segments
				...Fn.pipe(
					payload.memorySegmentsUpdated ?? [],
					$$ => Fn.take($$, kMaxActiveSegments),
					$$ => Fn.transform($$, segment => [
						saveMemorySegmentBlob(shard, userId, segment.id, segment.payload),
						channel.publish({ type: 'segment', id: segment.id }),
					])),

				// Save public segment set
				payload.publicSegmentsUpdate !== undefined && savePublicSegments(shard, userId, payload.publicSegmentsUpdate),
				payload.publicSegmentsUpdate !== undefined && channel.publish({ type: 'publicSet' }),

				// Save default public segment
				payload.defaultPublicSegmentUpdate !== undefined && saveDefaultPublicSegment(shard, userId, payload.defaultPublicSegmentUpdate),

				// Resolve + persist the foreign-segment request, then re-subscribe.
				async function() {
					if (payload.foreignSegmentRequest !== undefined) {
						activeForeignSegment = await saveActiveForeignSegment(shard, userId, activeForeignSegment, payload.foreignSegmentRequest);
						await syncForeignSubscription();
					}
				}(),
			]);
		},
	} ];
});
