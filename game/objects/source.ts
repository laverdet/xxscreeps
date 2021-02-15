import * as C from 'xxscreeps/game/constants';
import * as Game from 'xxscreeps/game/game';
import type { Shape } from 'xxscreeps/engine/schema/source';
import { withOverlay } from 'xxscreeps/schema';
import { RoomObject } from './room-object';

export class Source extends withOverlay<Shape>()(RoomObject) {
	get ticksToRegeneration() {
		return this._nextRegenerationTime === 0 ? undefined : Math.max(0, this._nextRegenerationTime - Game.time);
	}
	get _lookType() { return C.LOOK_SOURCES }
}
