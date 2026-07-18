import { RoomProcessor } from 'xxscreeps/engine/processor/room.js';
import { isStatName } from './schema.js';

declare module 'xxscreeps/engine/processor/room.js' {
	interface RoomProcessor {
		// eslint-disable-next-line @typescript-eslint/method-signature-style
		incrementRoomStat(userId: string | null | undefined, stat: string, amount: number): void;
	}
}

// Accumulate contributions directly on the room blob, which is being written every tick anyway.
// NPC ids (two characters or fewer, e.g. invaders / keepers) are ignored.
RoomProcessor.prototype.incrementRoomStat = function(userId, stat, amount) {
	if (amount === 0 || userId == null || userId.length <= 2) {
		return;
	}
	if (!isStatName(stat)) {
		throw new Error(`Unknown room stat: ${stat}`);
	}
	const stats = this.room['#userStats'];
	if (stats.length === 0) {
		this.room['#userStatsTime'] = Date.now();
	}
	const entry = stats.find(entry => entry.userId === userId && entry.stat === stat);
	if (entry) {
		entry.amount += amount;
	} else {
		stats.push({ amount, stat, userId });
	}
	this.didUpdate();
};
