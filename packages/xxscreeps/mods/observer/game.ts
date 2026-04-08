import { registerVariant } from 'xxscreeps/engine/schema/index.js';
import { registerGlobal } from 'xxscreeps/game/index.js';
import * as ObserverSpy from './observer-spy.js';
import * as Observer from './observer.js';

// Register schema
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const observerSchema = registerVariant('Room.objects', Observer.format);
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const observerSpySchema = registerVariant('Room.objects', ObserverSpy.format);

declare module 'xxscreeps/game/room/index.js' {
	interface Schema { observer: [ typeof observerSchema, typeof observerSpySchema ] }
}

registerGlobal(Observer.StructureObserver);
declare module 'xxscreeps/game/runtime.js' {
	interface Global {
		StructureObserver: typeof Observer.StructureObserver;
	}
}
