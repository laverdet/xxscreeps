declare module 'xxscreeps:mods/game' {
	import type { ChemistryRoomSchema } from 'xxscreeps/mods/classic/chemistry/game.js';

	interface RoomSchema { chemistry: [ ChemistryRoomSchema ] }
}
