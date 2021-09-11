import {registerVariant} from "xxscreeps/engine/schema";
import {registerGlobal} from "xxscreeps/game";
import * as Observer from './observer'

// Register schema
const observerSchema = registerVariant('Room.objects', Observer.format);
declare module 'xxscreeps/game/room' {
    interface Schema { observer: [ typeof observerSchema ] }
}

registerGlobal(Observer.StructureObserver);
declare module 'xxscreeps/game/runtime' {
    interface Global {
        StructureObserver: typeof Observer.StructureObserver;
    }
}
