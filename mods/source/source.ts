import * as Game from 'xxscreeps/game/game';
import * as RoomObject from 'xxscreeps/game/objects/room-object';
import { compose, declare, struct, variant, withOverlay } from 'xxscreeps/schema';
import { registerRoomObjectFormat } from 'xxscreeps/game/room';
import * as C from './constants';

function format() { return compose(shape, Source) }
const shape = declare('Source', struct(RoomObject.format, {
	...variant('source'),
	energy: 'int32',
	energyCapacity: 'int32',
	_nextRegenerationTime: 'int32',
}));

registerRoomObjectFormat(format);
declare module 'xxscreeps/game/room' {
	interface RoomObjectFormats { source: typeof format }
}

export class Source extends withOverlay(shape)(RoomObject.RoomObject) {
	get ticksToRegeneration() {
		return this._nextRegenerationTime === 0 ? undefined : Math.max(0, this._nextRegenerationTime - Game.time);
	}
	get _lookType() { return C.LOOK_SOURCES }
}
