declare module 'xxscreeps:mods/game' {
	import type { PortalRoomSchema } from 'xxscreeps/mods/portal/game.js';

	interface RoomSchema { portal: PortalRoomSchema }
}
