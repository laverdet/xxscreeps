import * as Game from 'xxscreeps/game/game';
import * as RoomObject from 'xxscreeps/game/objects/room-object';
import { compose, declare, struct, variant, withOverlay } from 'xxscreeps/schema';
import { registerSchema } from 'xxscreeps/engine/schema';
import * as C from './constants';

// Register schema
const shape = declare('Source', struct(RoomObject.format, {
	...variant('source'),
	energy: 'int32',
	energyCapacity: 'int32',
	_nextRegenerationTime: 'int32',
}));

const schema = registerSchema('Room.objects', () => compose(shape, Source));
declare module 'xxscreeps/engine/schema' {
	interface Schema { source: typeof schema }
}

// Game object declaration
export class Source extends withOverlay(shape)(RoomObject.RoomObject) {
	get ticksToRegeneration() {
		return this._nextRegenerationTime === 0 ? undefined : Math.max(0, this._nextRegenerationTime - Game.time);
	}
	get _lookType() { return C.LOOK_SOURCES }
}
