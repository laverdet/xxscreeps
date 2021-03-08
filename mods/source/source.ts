import * as C from './constants';
import * as Game from 'xxscreeps/game/game';
import * as RoomObject from 'xxscreeps/game/object';
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
	get _lookType() { return C.LOOK_SOURCES }
}
