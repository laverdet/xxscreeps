import { registerVariant } from 'xxscreeps/engine/schema/index.js';
import { registerGlobal } from 'xxscreeps/game/index.js';
import { compose } from 'xxscreeps/schema/index.js';
import * as ObserverSpy from './observer-spy.js';
import * as Observer from './observer.js';
import { observerShape, observerSpyShape } from './schema.js';

registerGlobal(Observer.StructureObserver);

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const observerSchema = registerVariant('Room.objects', compose(observerShape, Observer.StructureObserver));

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const observerSpySchema = registerVariant('Room.objects', compose(observerSpyShape, ObserverSpy.ObserverSpy));

// ---

declare module 'xxscreeps/game/runtime.js' {
	interface Global {
		StructureObserver: typeof Observer.StructureObserver;
	}
}

declare module 'xxscreeps/game/room/index.js' {
	interface RoomSchema { observer: [ typeof observerSchema, typeof observerSpySchema ] }
}
