import type { GameConstructor } from 'xxscreeps/game/index.js';
import type { Room } from 'xxscreeps/game/room/index.js';
import * as Memory from 'xxscreeps/mods/memory/memory.js';
import { runForUser } from 'xxscreeps/game/index.js';
import { registerRoomTickProcessor } from 'xxscreeps/engine/processor/index.js';

// Mark an NPC as active in a room
export function activateNPC(room: Room, user: string) {
	room['#npcData'].users.add(user);
}

// NPC loop registration for mods
type NPCLoop = (game: GameConstructor) => boolean;
const npcLoops = new Map<string, NPCLoop>();
export function registerNPC(id: string, loop: NPCLoop) {
	npcLoops.set(id, loop);
}

// NPC loop processor
registerRoomTickProcessor((room, context) => {
	const data = room['#npcData'];
	for (const user of data.users) {
		// Initialize NPC state
		const memory = data.memory.get(user) ?? new Uint8Array(0);
		const loop = npcLoops.get(user)!;
		Memory.initialize(memory);

		// Run loop and reset memory or mark user as inactive
		const [ intents, result ] = runForUser(user, context.state, loop);
		if (result) {
			const memory = Memory.flush().payload;
			if (memory) {
				data.memory.set(user, memory);
			}
			context.setActive();
		} else {
			data.memory.delete(user);
			data.users.delete(user);
			context.didUpdate();
		}

		// Save intents
		const roomIntents = intents.getIntentsForRoom(room.name);
		if (roomIntents) {
			context.saveIntents(user, roomIntents);
		}
	}
});
