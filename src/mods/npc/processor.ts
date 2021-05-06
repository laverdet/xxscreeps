import type { GameConstructor } from 'xxscreeps/game';
import type { Room } from 'xxscreeps/game/room';
import * as Memory from 'xxscreeps/mods/memory/memory';
import { runForUser } from 'xxscreeps/game';
import { registerRoomTickProcessor } from 'xxscreeps/engine/processor';
import { NPCData } from './game';

// Mark an NPC as active in a room
export function activateNPC(room: Room, user: string) {
	room[NPCData].users.add(user);
}

// NPC loop registration for mods
type NPCLoop = (game: GameConstructor) => boolean;
const npcLoops = new Map<string, NPCLoop>();
export function registerNPC(id: string, loop: NPCLoop) {
	npcLoops.set(id, loop);
}

// NPC loop processor
registerRoomTickProcessor((room, context) => {
	const data = room[NPCData];
	for (const user of data.users) {
		// Initialize NPC state
		const memory = data.memory.get(user) ?? new Uint8Array(0);
		const loop = npcLoops.get(user)!;
		Memory.initialize(memory);

		// Run loop and reset memory or mark user as inactive
		const [ intents, result ] = runForUser(user, context.state, loop);
		if (result) {
			data.memory.set(user, Memory.flush());
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
