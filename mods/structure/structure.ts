import type { AnyRoomObject } from 'xxscreeps/game/room';
import * as C from 'xxscreeps/game/constants';
import * as Game from 'xxscreeps/game';
import * as Id from 'xxscreeps/engine/schema/id';
import * as RoomObject from 'xxscreeps/game/object';
import { compose, declare, member, struct, withOverlay } from 'xxscreeps/schema';

export type AnyStructure = Extract<AnyRoomObject, Structure>;

export const format = () => compose(shape, Structure);
const shape = declare('Structure', struct(RoomObject.format, {
	hits: 'int32',
	owner: member(RoomObject.Owner, Id.optionalFormat),
}));

export abstract class Structure extends withOverlay(RoomObject.RoomObject, shape) {
	abstract get structureType(): string;
	get hitsMax() { return this.hits }
	get my() { return this.owner === null ? undefined : this.owner === Game.me }
	get owner() { return this[RoomObject.Owner] }
	get [RoomObject.LookType]() { return C.LOOK_STRUCTURES }

	[RoomObject.AddToMyGame](game: Game.Game) {
		game.structures[this.id] = this as never;
	}
}

declare module 'xxscreeps/game' {
	interface Game {
		structures: Record<string, AnyStructure>;
	}
}
Game.registerGameInitializer(game => game.structures = Object.create(null));
