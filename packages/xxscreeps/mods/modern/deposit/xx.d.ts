declare module 'xxscreeps:mods/game' {
	import type { DepositFind, DepositLook, DepositRoomSchema } from 'xxscreeps/mods/modern/deposit/game.js';

	interface Find { deposit: DepositFind }
	interface Look { deposit: DepositLook }
	interface RoomSchema { deposit: [ DepositRoomSchema ] }
}
