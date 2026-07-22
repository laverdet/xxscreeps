declare module 'xxscreeps:mods/game' {
	import type { PowerspawnRoomSchema } from 'xxscreeps/mods/modern/powerspawn/game.js';

	interface RoomSchema { powerspawn: [ PowerspawnRoomSchema ] }
}
