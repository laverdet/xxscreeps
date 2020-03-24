import * as C from '~/engine/game/constants';
import { gameContext } from '~/engine/game/context';
import { checkCast, withType, Format, Inherit, Interceptor, Variant } from '~/engine/schema';
import * as Id from '~/engine/util/id';
import { fetchPositionArgument, RoomPosition } from '../position';
import { format as roomObjectFormat, RoomObject } from './room-object';
import { format as storeFormat, Store } from '../store';
import type { Source } from './source';

declare const Memory: any;

export const AgeTime = Symbol('ageTime');
export const Owner = Symbol('owner');

export const format = withType<Creep>(checkCast<Format>()({
	[Inherit]: roomObjectFormat,
	[Variant]: 'creep',
	ageTime: 'int32',
	// body: makeVector({ boost: 'uint8', type: 'uint8', hits: 'uint8' })
	fatigue: 'int16',
	hits: 'int16',
	name: 'string',
	owner: Id.format,
	// saying: ...
	store: storeFormat,
}));

export class Creep extends RoomObject {
	get [Variant]() { return 'creep' }
	get carry() { return this.store }
	get carryCapacity() { return this.store.getCapacity() }
	get memory() {
		const creeps = Memory.creeps ?? (Memory.creeps = {});
		return creeps[this.name] ?? (creeps[this.name] = {});
	}
	get my() { return this[Owner] === gameContext.userId }
	get spawning() { return this[AgeTime] === 0 }
	get ticksToLive() { return this[AgeTime] === 0 ? undefined : this[AgeTime] - Game.time }

	harvest(source: Source) {
		return C.ERR_NOT_IN_RANGE;
	}

	move(target: number) {
		if (!this.my) {
			return C.ERR_NOT_OWNER;
		} else if (this.spawning) {
			return C.ERR_BUSY;
		} else if (this.fatigue > 0) {
			return C.ERR_TIRED;
		}
		// TODO: body parts
		const dir = target | 0;
		if (!(dir >= 1 && dir <= 8)) {
			return C.ERR_INVALID_ARGS;
		}
		gameContext.intents.save(this, 'move', { direction: dir });
		return C.OK;
	}

	moveTo(x: number, y: number): number;
	moveTo(pos: RoomObject | RoomPosition): number;
	moveTo(...args: [any]) {

		// Basic checks
		if (!this.my) {
			return C.ERR_NOT_OWNER;
		} else if (this.spawning) {
			return C.ERR_BUSY;
		} else if (this.fatigue > 0) {
			return C.ERR_TIRED;
		}

		// Parse target
		const { pos } = fetchPositionArgument(this.pos, ...args);
		if (pos === undefined) {
			return C.ERR_INVALID_TARGET;
		} else if (pos.isNearTo(this.pos)) {
			return C.OK;
		}

		// Find a path
		const path = this.pos.findPathTo(pos);
		if (path.length === 0) {
			return C.ERR_NO_PATH;
		}

		// And move one tile
		return this.move(path[0].direction);
	}

	fatigue!: number;
	hits!: number;
	name!: string;
	store!: Store;
	protected [AgeTime]!: number;
	protected [Owner]!: string;
}

export const interceptors = {
	Creep: checkCast<Interceptor>()({
		overlay: Creep,
		members: {
			ageTime: { symbol: AgeTime },
			owner: { symbol: Owner, ...Id.interceptors },
		},
	}),
};

export const schemaFormat = { Creep: format };
