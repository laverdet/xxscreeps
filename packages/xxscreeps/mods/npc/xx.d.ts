declare module 'xxscreeps:mods/game' {
	import type { NpcRoomSchema } from 'xxscreeps/mods/npc/game.js';

	interface RoomSchema { npc: NpcRoomSchema }
}
