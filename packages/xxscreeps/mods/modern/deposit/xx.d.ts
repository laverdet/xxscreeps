declare module 'xxscreeps:mods/game' {
	import type { Deposit } from 'xxscreeps/mods/modern/deposit/deposit.js';
	import type { DepositFind, DepositLook, DepositRoomSchema } from 'xxscreeps/mods/modern/deposit/game.js';

	interface Find { deposit: DepositFind }
	interface Look { deposit: DepositLook }
	interface RoomObjects { deposit: Deposit }
	interface RoomSchema { deposit: [ DepositRoomSchema ] }
}

declare module 'xxscreeps:mods/processor' {
	import type { DepositIntents } from 'xxscreeps/mods/modern/deposit/processor.js';

	interface Intent { deposit: DepositIntents }
}
