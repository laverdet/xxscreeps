import * as Game from 'xxscreeps/game/game';
import { withOverlay } from 'xxscreeps/schema';
import { RoomObject } from 'xxscreeps/game/objects/room-object';
import * as C from './constants';
import type { Shape } from './schema';

export class Source extends withOverlay<Shape>()(RoomObject) {
	get ticksToRegeneration() {
		return this._nextRegenerationTime === 0 ? undefined : Math.max(0, this._nextRegenerationTime - Game.time);
	}
	get _lookType() { return C.LOOK_SOURCES }
}
