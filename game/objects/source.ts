import * as C from '~/game/constants';
import * as Game from '~/game/game';
import type { Shape } from '~/engine/schema/source';
import { withOverlay } from '~/lib/schema';
import { RoomObject } from './room-object';

export class Source extends withOverlay<Shape>()(RoomObject) {
	get ticksToRegeneration() {
		return this._nextRegenerationTime === 0 ? undefined : Math.max(0, this._nextRegenerationTime - Game.time);
	}
	get _lookType() { return C.LOOK_SOURCES }
}
