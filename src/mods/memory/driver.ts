import * as Fn from 'xxscreeps/utility/functional';
import { registerDriverConnector } from 'xxscreeps/driver';
import { kMaxActiveSegments } from './memory';
import { loadMemorySegmentBlob, loadUserMemoryBlob, saveMemoryBlob, saveMemorySegmentBlob } from './model';

registerDriverConnector(player => {
	const { shard, userId } = player;
	let activeSegments = new Set<number>();
	let nextSegments: Set<number> | undefined;
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
		},

		async save(payload) {
			// Update activate segments
			if (payload.activeSegmentsRequest) {
				nextSegments = new Set(Fn.take(payload.activeSegmentsRequest, kMaxActiveSegments));
			}
			await Promise.all([
				// Save primary memory blob
				saveMemoryBlob(shard, userId, payload.memoryUpdated),
				// Save memory segments
				payload.memorySegmentsUpdated ?
					Promise.all(Fn.map(Fn.take(payload.memorySegmentsUpdated, kMaxActiveSegments),
						segment => saveMemorySegmentBlob(shard, userId, segment.id, segment.payload))) :
					undefined,
			]);
		},
	} ];
});
