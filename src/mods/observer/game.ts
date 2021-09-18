import { registerVariant } from 'xxscreeps/engine/schema';
import { registerGlobal } from 'xxscreeps/game';
import * as ObserverSpy from 'xxscreeps/mods/observer/observer_spy';
import * as Observer from './observer';

// Register schema
const observerSchema = registerVariant('Room.objects', Observer.format);
const observerSpySchema = registerVariant('Room.objects', ObserverSpy.format);

declare module 'xxscreeps/game/room' {
	interface Schema {observer: [ typeof observerSchema, typeof observerSpySchema ]}
}

registerGlobal(Observer.StructureObserver);
declare module 'xxscreeps/game/runtime' {
	interface Global {
		StructureObserver: typeof Observer.StructureObserver;
	}
}
