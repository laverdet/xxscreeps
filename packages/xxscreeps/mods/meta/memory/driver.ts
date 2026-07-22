import type { ForeignSegmentPayload, SegmentPayload, flush } from './memory.js';
import type { Shard } from 'xxscreeps/engine/db/shard.js';
import type { Effect } from 'xxscreeps/utility/types.js';
import * as User from 'xxscreeps/engine/db/user/index.js';
import { hooks } from 'xxscreeps/engine/runner/index.js';
import { Fn } from 'xxscreeps/functional/fn.js';
import { disposableToEffect } from 'xxscreeps/utility/utility.js';
import { isValidSegmentId, kMaxActiveSegments } from './memory.js';
import { isPublicSegment, loadDefaultPublicSegment, loadMemorySegmentBlob, loadUserMemoryBlob, publicSegmentChannel, saveDefaultPublicSegment, saveMemoryBlob, saveMemorySegmentBlob, savePublicSegments } from './model.js';

interface ForeignSegmentRequest {
	id: number | undefined;
	username: string;
}

interface ActiveForeignSegment {
	username: string;
	userId: string;
	segmentId: number;
}

async function resolveActiveForeignSegment(
	shard: Shard,
	previous: ActiveForeignSegment | undefined,
	request: ForeignSegmentRequest | undefined | null,
): Promise<ActiveForeignSegment | undefined> {
	if (request) {
		// Resolve userid from username request
		const requestUserId = await async function() {
			if (previous?.username === request.username) {
				return previous.userId;
			} else {
				return User.findUserByName(shard.db, request.username);
			}
		}();

		// Resolve the requested segment id
		const requestSegmentId = await async function() {
			if (requestUserId != null) {
				if (request.id === undefined) {
					return loadDefaultPublicSegment(shard, requestUserId);
				} else if (isValidSegmentId(request.id)) {
					return request.id;
				}
			}
		}();

		// Construct a new active segment, or return the old one for quick equality check.
		if (requestUserId === previous?.userId && requestSegmentId === previous.segmentId) {
			return previous;
		} else if (requestUserId == null || requestSegmentId == null) {
			return undefined;
		} else {
			return {
				segmentId: requestSegmentId,
				userId: requestUserId,
				username: request.username,
			};
		}
	}
}

hooks.register('runnerConnector', async player => {
	using disposable = new DisposableStack();
	const { shard, userId } = player;

	// Own memory segments state. The own channel subscription watches for out-of-band segment writes,
	// e.g. from the memory-segment API endpoint.
	let activeSegments: Set<number>;
	let nextSegments: Set<number> | undefined;
	const dirtyOwnSegments = new Set<number>();
	const ownSubscription = disposable.use(await publicSegmentChannel(shard, userId).subscribe());
	ownSubscription.listen(message => {
		if (message.type === 'segment') {
			dirtyOwnSegments.add(message.id);
		}
	});

	// Foreign segment state. `RawMemory.setActiveForeignSegment()` must be invoked during this
	// runner's lifetime, diverging from Screeps which stores that persistently for some reason.
	// xxscreeps behavior is more consistent with `RawMemory.setActiveSegments()`.
	let foreignSegment: ActiveForeignSegment | undefined;
	let foreignDirty = true;
	let foreignVisible = true;
	let foreignChannelEffect: Effect | undefined;
	disposable.defer(() => foreignChannelEffect?.());

	return [ disposableToEffect(disposable.move()), {
		async initialize(payload) {
			// Reset player segments
			activeSegments = new Set();
			nextSegments = undefined;
			dirtyOwnSegments.clear();
			payload.memoryBlob = await loadUserMemoryBlob(shard, userId);
			// Reset foreign segments
			foreignSegment = undefined;
			foreignDirty = true;
			foreignChannelEffect?.();
			foreignChannelEffect = undefined;
		},

		async refresh(payload) {
			[ payload.memorySegments, payload.foreignSegment ] = await Promise.all([
				// Load own segment payload
				async function() {
					const memorySegments = await Fn.pipe(
						Fn.concat([
							// Select any newly-requested memory segments
							nextSegments ? Fn.reject(nextSegments, id => activeSegments.has(id)) : [],
							// Resend active segments written out-of-band since the last tick
							dirtyOwnSegments.intersection(nextSegments ?? activeSegments),
						]),
						$$ => new Set($$),
						$$ => Fn.mapAwait($$, async id => ({
							id,
							payload: await loadMemorySegmentBlob(shard, userId, id),
						})),
					);
					activeSegments = nextSegments ?? activeSegments;
					nextSegments = undefined;
					dirtyOwnSegments.clear();
					return memorySegments;
				}(),

				// Load foreign segment payload
				async function() {
					if (!foreignVisible) {
						return null;
					} else if (foreignDirty) {
						foreignDirty = false;
						if (foreignSegment) {
							const { username, userId: targetUserId, segmentId } = foreignSegment;
							const blob = await loadMemorySegmentBlob(shard, targetUserId, segmentId);
							if (blob !== null) {
								return { username, id: segmentId, bytes: blob };
							}
						}
						return null;
					}
				}(),
			]);
		},

		async save(payload) {
			// Update active segments
			if (payload.activeSegmentsRequest) {
				nextSegments = new Set(Fn.take(payload.activeSegmentsRequest, kMaxActiveSegments));
			}

			// Dispatch updates
			await Promise.all([
				// Save primary memory blob
				payload.memoryUpdated.payload && saveMemoryBlob(shard, userId, payload.memoryUpdated.payload),

				// Save memory segments
				...Fn.pipe(
					payload.memorySegmentsUpdated ?? [],
					$$ => Fn.take($$, kMaxActiveSegments),
					$$ => Fn.transform($$, segment => [
						saveMemorySegmentBlob(shard, userId, segment.id, segment.payload),
						ownSubscription.publish({ type: 'segment', id: segment.id }),
					])),

				// Save public segment set
				payload.publicSegmentsUpdate &&
					savePublicSegments(shard, userId, payload.publicSegmentsUpdate),

				// Save default public segment
				payload.defaultPublicSegmentUpdate !== undefined &&
					saveDefaultPublicSegment(shard, userId, payload.defaultPublicSegmentUpdate),

				// Resolve & subscribe the foreign-segment request
				// nb: Throwing in this chain possibly orphans 'subscriptionEffect'
				async function() {
					const { foreignSegmentRequest } = payload;
					if (foreignSegmentRequest !== undefined) {
						const nextForeignSegment = await resolveActiveForeignSegment(shard, foreignSegment, foreignSegmentRequest);
						if (nextForeignSegment !== foreignSegment) {
							foreignDirty = true;
							await Promise.all([
								// Maybe update the subscription
								async function() {
									if (nextForeignSegment?.userId !== foreignSegment?.userId) {
										foreignChannelEffect?.();
										foreignChannelEffect = undefined;
										if (nextForeignSegment) {
											const subscription = await publicSegmentChannel(shard, nextForeignSegment.userId).subscribe();
											subscription.listen(message => {
												switch (message.type) {
													case 'publicSet':
														foreignVisible = message.ids.includes(foreignSegment!.segmentId);
														break;

													case 'segment':
														if (message.id === foreignSegment!.segmentId) {
															foreignDirty = true;
														}
														break;
												}
											});
											foreignChannelEffect = () => subscription.disconnect();
										}
									}
									foreignSegment = nextForeignSegment;
								}(),
								// Check visibility
								async function() {
									if (nextForeignSegment) {
										foreignVisible = await isPublicSegment(shard, nextForeignSegment.userId, nextForeignSegment.segmentId);
									}
								}(),
							]);
						}
					}
				}(),
			]);
		},
	} ];
});

// ---

declare module 'xxscreeps/engine/runner/index.js' {
	interface InitializationPayload {
		memoryBlob: Readonly<Uint8Array> | null;
	}
	interface TickPayload {
		// Player memory segments. The runtime maintains its own list of active segment ids and merges
		// the contents of this payload into `RawMemory.segments`
		memorySegments: SegmentPayload[];
		// Tri-state: `undefined` = no change, `null` = clear, object = install
		foreignSegment?: ForeignSegmentPayload | null | undefined;
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
