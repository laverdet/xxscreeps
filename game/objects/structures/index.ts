import * as C from '~/game/constants';
import * as Game from '~/game/game';
import type { AnyRoomObject } from '~/game/room';
import { RoomObject } from '../room-object';
import type { shape } from '~/engine/schema/structure';
import { withOverlay } from '~/lib/schema';

export type AnyStructure = Extract<AnyRoomObject, Structure>;

export abstract class Structure extends withOverlay<typeof shape>()(RoomObject) {
	abstract get structureType(): string;
	get hitsMax() { return this.hits }
	get my() { return this._owner === undefined ? undefined : this._owner === Game.me }
	get owner() { return {} }
	get _lookType() { return C.LOOK_STRUCTURES }
}
