import * as C from './constants';
import * as RoomObject from 'xxscreeps/game/object';
import { Game, registerGlobal } from 'xxscreeps/game';
import { compose, declare, struct, variant, withOverlay } from 'xxscreeps/schema';

export const format = () => compose(shape, Source);
const shape = declare('Source', struct(RoomObject.format, {
	...variant('source'),
	energy: 'int32',
	energyCapacity: 'int32',
	_nextRegenerationTime: 'int32',
}));

// Game object declaration
export class Source extends withOverlay(RoomObject.RoomObject, shape) {
	get ticksToRegeneration() {
		return this._nextRegenerationTime === 0 ? undefined : Math.max(0, this._nextRegenerationTime - Game.time);
	}
	get [RoomObject.LookType]() { return C.LOOK_SOURCES }
}

// Export `Source` to runtime globals
registerGlobal(Source);
declare module 'xxscreeps/game/runtime' {
	interface Global { Source: typeof Source }
}
