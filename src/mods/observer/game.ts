import { registerVariant } from 'xxscreeps/engine/schema/index.js';
import { registerGlobal } from 'xxscreeps/game/index.js';
import * as ObserverSpy from './observer-spy.js';
import * as Observer from './observer.js';

// Register schema
const observerSchema = registerVariant('Room.objects', Observer.format);
const observerSpySchema = registerVariant('Room.objects', ObserverSpy.format);

declare module 'xxscreeps/game/room' {
	interface Schema { observer: [ typeof observerSchema, typeof observerSpySchema ] }
}

registerGlobal(Observer.StructureObserver);
declare module 'xxscreeps/game/runtime' {
	interface Global {
		StructureObserver: typeof Observer.StructureObserver;
	}
}
