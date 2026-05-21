import type { Shard } from 'xxscreeps/engine/db/index.js';
import type { World } from 'xxscreeps/game/map.js';
import type { Room } from 'xxscreeps/game/room/index.js';
import { consumeSet } from 'xxscreeps/engine/db/async.js';
import { finalizeExtraRoomsSetKey } from './model.js';
import { RoomProcessor } from './room.js';

// Drain finalizeExtraRoomsSetKey(time) and run process+finalize for each
// inter-room-intent target that wasn't already in the tick's process queue.
export async function *finalizeExtraRooms(
	shard: Shard, world: World, time: number,
	resolveRoom: (name: string) => Promise<Room>,
): AsyncGenerator<readonly [string, Room]> {
	for await (const roomName of consumeSet(shard.scratch, finalizeExtraRoomsSetKey(time))) {
		const room = await resolveRoom(roomName);
		const context = new RoomProcessor(shard, world, room, time);
		await context.process(true);
		await context.finalize(true);
		yield [ roomName, room ] as const;
	}
}
