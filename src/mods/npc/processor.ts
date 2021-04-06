import type { Room } from 'xxscreeps/game/room';
import * as Game from 'xxscreeps/game';
import * as Memory from 'xxscreeps/game/memory';
import { registerRoomTickProcessor } from 'xxscreeps/processor';
import { NPCData } from './game';

// Mark an NPC as active in a room
export function activateNPC(room: Room, user: string) {
	room[NPCData].users.add(user);
}

// NPC loop registration for mods
type NPCLoop = () => boolean;
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
		Game.initializeIntents();
		Memory.initialize(memory);

		// Run loop and reset memory or mark user as inactive
		if (Game.runAsUser(user, () => loop())) {
			data.memory.set(user, Memory.flush());
			context.setActive();
		} else {
			data.memory.delete(user);
			data.users.delete(user);
			context.didUpdate();
		}

		// Save intents
		const intentManager = Game.flushIntents();
		const roomIntents = intentManager.acquireIntentsForGroup('room') ?? {};
		context.saveIntents(user, {
			room: roomIntents[room.name],
			objects: intentManager.intentsByGroup[room.name],
		});
	}
});
