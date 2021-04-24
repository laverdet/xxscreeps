import type { InspectOptionsStylized } from 'util';
import type { Room } from 'xxscreeps/game/room';
import * as Id from 'xxscreeps/engine/schema/id';
import * as BufferObject from 'xxscreeps/schema/buffer-object';
import * as RoomPosition from 'xxscreeps/game/position';
import { compose, declare, struct, withOverlay } from 'xxscreeps/schema';
import { expandGetters } from 'xxscreeps/utility/inspect';
import { assign } from 'xxscreeps/utility/utility';
import { AddToMyGame, AfterInsert, AfterRemove, LookType, NextPosition, Owner, PathCost, RunnerUser } from './symbols';
import { GameConstructor, registerGlobal } from '..';

export { AddToMyGame, AfterInsert, AfterRemove, LookType, NextPosition, Owner, PathCost, RunnerUser };

export const format = () => compose(shape, RoomObject);
const shape = declare('RoomObject', struct({
	id: Id.format,
	pos: RoomPosition.format,
}));

export type RoomObjectWithOwner = { [Owner]: string } & RoomObject;

export abstract class RoomObject extends withOverlay(BufferObject.BufferObject, shape) {
	abstract get [LookType](): string;
	room!: Room;
	[NextPosition]?: RoomPosition.RoomPosition | null;

	[AddToMyGame](_game: GameConstructor) {}
	[AfterInsert](room: Room) {
		this.room = room;
	}
	[AfterRemove](_room: Room) {
		this.room = undefined as never;
	}

	[RunnerUser](): string | null {
		return null;
	}

	[Symbol.for('nodejs.util.inspect.custom')](depth: number, options: InspectOptionsStylized) {
		if (BufferObject.check(this)) {
			return expandGetters(this);
		} else {
			return `${options.stylize(`[${this.constructor.name}]`, 'special')}${options.stylize('{released}', 'null')}`;
		}
	}

	get [PathCost](): undefined | number {
		return undefined;
	}
}

export function create<Type extends RoomObject>(instance: Type, pos: RoomPosition.RoomPosition): Type {
	return assign<Type, RoomObject>(instance, {
		id: Id.generateId(),
		pos,
	});
}

// Export `RoomObject` to runtime globals
registerGlobal(RoomObject);
declare module 'xxscreeps/game/runtime' {
	interface Global {
		RoomObject: typeof RoomObject;
	}
}
