import type { SegmentPayload, flush } from './memory';
import type { TickResult } from 'xxscreeps/engine/runner';
import Fn from 'xxscreeps/utility/functional';
import { kMaxActiveSegments } from './memory';
import { hooks } from 'xxscreeps/engine/runner';
import { loadMemorySegmentBlob, loadUserMemoryBlob, saveMemoryBlob, saveMemorySegmentBlob } from './model';

// Receive and send memory payloads from driver
declare module 'xxscreeps/engine/runner' {
	interface InitializationPayload {
		memoryBlob: Readonly<Uint8Array> | null;
	}
	interface TickPayload {
		memorySegments?: SegmentPayload[];
	}
	interface TickResult {
		activeSegmentsRequest: number[] | null;
		foreignSegmentRequest: null | {
			id: number | undefined;
			username: string;
		};
		memorySegmentsUpdated: SegmentPayload[] | null;
		memoryUpdated: ReturnType<typeof flush>;
	}
}

hooks.register('runnerConnector', player => {
	const { shard, userId } = player;
	let activeSegments = new Set<number>();
	let nextSegments: Set<number> | undefined;
	let foreignSegmentRequest: TickResult['foreignSegmentRequest'] = null;
	return [ undefined, {
		async initialize(payload) {
			// Get current memory payload
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
			if (foreignSegmentRequest) {
				// TODO
			}
		},

		async save(payload) {
			// Update activate segments
			if (payload.activeSegmentsRequest) {
				nextSegments = new Set(Fn.take(payload.activeSegmentsRequest, kMaxActiveSegments));
			}
			foreignSegmentRequest = payload.foreignSegmentRequest;
			await Promise.all([
				// Save primary memory blob
				payload.memoryUpdated.payload && saveMemoryBlob(shard, userId, payload.memoryUpdated.payload),
				// Save memory segments
				payload.memorySegmentsUpdated &&
					Promise.all(Fn.map(Fn.take(payload.memorySegmentsUpdated, kMaxActiveSegments),
						segment => saveMemorySegmentBlob(shard, userId, segment.id, segment.payload))),
			]);
		},
	} ];
});
