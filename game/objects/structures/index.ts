import * as Game from '~/game/game';
import type { AnyRoomObject } from '~/game/room';
import { RoomObject } from '../room-object';
import type { shape } from '~/engine/schema/structure';
import { withOverlay } from '~/lib/schema';

export type AnyStructure = Extract<AnyRoomObject, Structure>;

export abstract class Structure extends withOverlay<typeof shape>()(RoomObject) {
	abstract get structureType(): string;
	get my() { return this._owner === Game.me }
}
