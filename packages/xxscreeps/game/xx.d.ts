declare module 'xxscreeps:mods/main';
declare module 'xxscreeps:mods/schema';

declare module 'xxscreeps:mods/constants' {
	export * from 'xxscreeps/game/constants/index.js';

	export * from 'xxscreeps/mods/meta/flag/constants.js';
	export * from 'xxscreeps/mods/portal/constants.js';
}

declare module 'xxscreeps:mods/game' {
	// eslint-disable-next-line @typescript-eslint/no-empty-object-type
	interface Find {}
	// eslint-disable-next-line @typescript-eslint/no-empty-object-type
	interface Look {}
	// eslint-disable-next-line @typescript-eslint/no-empty-object-type
	interface RoomSchema {}
}

declare module 'xxscreeps:mods/processor' {
	import { MovementIntents } from 'xxscreeps/engine/processor/movement.js';

	interface Intent {
		movement: MovementIntents;
	}
}
