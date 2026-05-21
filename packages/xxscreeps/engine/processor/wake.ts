import { sleepingRoomsKey } from './model.js';
import { WakeField, hooks } from './symbols.js';

hooks.register('refreshRoom', async (shard, room) => {
	let min = Infinity;
	for (const object of room['#objects']) {
		const time = object[WakeField]?.(object) ?? 0;
		if (time > 0 && time < min) {
			min = time;
		}
	}
	if (min !== Infinity) {
		await shard.scratch.zAdd(sleepingRoomsKey, [ [ min - 1, room.name ] ], { if: 'NX' });
	}
});
