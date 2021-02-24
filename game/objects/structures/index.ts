import * as C from 'xxscreeps/game/constants';
import * as Game from 'xxscreeps/game/game';
import type { AnyRoomObject } from 'xxscreeps/game/room';
import { RoomObject } from '../room-object';
import type { Shape } from 'xxscreeps/engine/schema/structure';
import { withOverlay } from 'xxscreeps/schema';

export type AnyStructure = Extract<AnyRoomObject, Structure>;

export abstract class Structure extends withOverlay<Shape>()(RoomObject) {
	abstract get structureType(): string;
	get hitsMax() { return this.hits }
	get my() { return this._owner === null ? undefined : this._owner === Game.me }
	get owner() { return {} }
	get _lookType() { return C.LOOK_STRUCTURES }
}
