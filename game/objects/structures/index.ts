import * as C from 'xxscreeps/game/constants';
import * as Game from 'xxscreeps/game/game';
import type { AnyRoomObject } from 'xxscreeps/game/room';
import * as RoomObject from 'xxscreeps/game/object';
import * as Id from 'xxscreeps/engine/schema/id';
import { compose, declare, member, struct, withOverlay } from 'xxscreeps/schema';

export type AnyStructure = Extract<AnyRoomObject, Structure>;

export function format() { return compose(shape, Structure) }
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
}
