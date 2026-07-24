declare module 'xxscreeps:mods/game' {
	import type { ObserverRoomSchemas } from 'xxscreeps/mods/modern/observer/game.js';
	import type { ObserverSpy } from 'xxscreeps/mods/modern/observer/observer-spy.js';
	import type { StructureObserver } from 'xxscreeps/mods/modern/observer/observer.js';

	interface ConstructionCost { observer: 8000 }
	interface RoomObjects {
		ObserverSpy: ObserverSpy;
		observer: StructureObserver;
	}
	interface RoomSchema { observer: ObserverRoomSchemas }
}

declare module 'xxscreeps:mods/processor' {
	import type { ObserverIntents } from 'xxscreeps/mods/modern/observer/processor.js';

	interface Intent { observer: ObserverIntents }
}
