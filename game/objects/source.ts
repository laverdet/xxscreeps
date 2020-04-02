import type { shape } from '~/engine/schema/source';
import { withOverlay } from '~/lib/schema';
import { RoomObject } from './room-object';

export const NextRegenerationTime = Symbol('nextRegenerationTime');

export class Source extends withOverlay<typeof shape>()(RoomObject) {
	get ticksToRegeneration() {
		return this[NextRegenerationTime] === 0 ? undefined : this[NextRegenerationTime] - Game.time;
	}
}
