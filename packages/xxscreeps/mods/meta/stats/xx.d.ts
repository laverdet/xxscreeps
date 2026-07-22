declare module 'xxscreeps:mods/game' {
	import type { StatsRoomSchema } from 'xxscreeps/mods/meta/stats/schema.js';

	interface RoomSchema { stats: [ StatsRoomSchema ] }
}
