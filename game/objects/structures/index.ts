import { RoomObject } from '../room-object';
import { gameContext } from '~/game/context';
import type { shape } from '~/engine/schema/structure';
import { withOverlay } from '~/lib/schema';

export abstract class Structure extends withOverlay<typeof shape>()(RoomObject) {
	abstract get structureType(): string;
	get my() { return this._owner === gameContext.userId }
}
