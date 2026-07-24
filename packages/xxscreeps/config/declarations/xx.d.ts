declare module 'xxscreeps:backend' {
	interface Context {
		authenticateForProvider: (provider: string, providerId: string) => Promise<string>;
		flushToken: (initializeGuest?: boolean) => Promise<string | undefined>;
	}
	interface State {
		newUserId?: string | undefined;
		userId?: string | undefined;
		provider?: string | undefined;
		providerId?: string | undefined;
		token?: string | undefined;
	}
}

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
