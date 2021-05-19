import type { GameConstructor } from '.';
import type { InspectOptionsStylized } from 'util';
import type { Room } from 'xxscreeps/game/room';
import * as Id from 'xxscreeps/engine/schema/id';
import * as BufferObject from 'xxscreeps/schema/buffer-object';
import * as RoomPosition from 'xxscreeps/game/position';
import { compose, declare, struct, withOverlay } from 'xxscreeps/schema';
import { expandGetters } from 'xxscreeps/utility/inspect';
import { assign } from 'xxscreeps/utility/utility';
import { registerGlobal } from '.';

export const format = () => compose(shape, RoomObject);
const shape = declare('RoomObject', struct({
	id: Id.format,
	pos: RoomPosition.format,
}));

export abstract class RoomObject extends withOverlay(BufferObject.BufferObject, shape) {
	abstract get ['#lookType'](): string;
	room!: Room;
	['#nextPosition']?: RoomPosition.RoomPosition;
	['#nextPositionTime']?: number;

	get ['#extraUsers'](): string[] { return [] }
	get ['#hasIntent']() { return false }
	get ['#pathCost'](): undefined | number { return undefined }
	get ['#providesVision']() { return false }
	get ['#user'](): string | null { return null }
	set ['#user'](_user: string | null) { throw new Error('Setting #user on unownable object') }
	// eslint-disable-next-line no-useless-return
	get my(): boolean | undefined { return }

	['#addToMyGame'](_game: GameConstructor) {}
	['#afterInsert'](room: Room) {
		this.room = room;
	}

	['#afterRemove'](_room: Room) {
		this.room = undefined as never;
	}

	private [Symbol.for('nodejs.util.inspect.custom')](depth: number, options: InspectOptionsStylized) {
		if (BufferObject.check(this)) {
			return expandGetters(this);
		} else {
			return `${options.stylize(`[${this.constructor.name}]`, 'special')} ${options.stylize('{released}', 'null')}`;
		}
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
