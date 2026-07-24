declare module 'xxscreeps:mods/game' {
	import type { PortalRoomSchema } from 'xxscreeps/mods/portal/game.js';
	import type { StructurePortal } from 'xxscreeps/mods/portal/portal.js';

	interface RoomObjects { portal: StructurePortal }
	interface RoomSchema { portal: PortalRoomSchema }
}
