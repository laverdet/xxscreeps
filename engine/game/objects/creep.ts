import * as C from '~/engine/game/constants';
import { gameContext } from '~/engine/game/context';
import * as Memory from '~/engine/game/memory';
import { checkCast, makeEnum, makeVector, withType, Format, FormatShape, Inherit, Interceptor, Variant } from '~/engine/schema';
import * as Id from '~/engine/util/id';
import { fetchPositionArgument, RoomPosition } from '../position';
import { format as roomObjectFormat, Owner, RoomObject } from './room-object';
import { format as storeFormat, resourceEnumFormat, Store } from '../store';
import type { Source } from './source';
export { Owner };

const bodyFormat = makeVector({
	boost: resourceEnumFormat,
	hits: 'uint8',
	type: makeEnum(...C.BODYPARTS_ALL),
});

export const format = withType<Creep>(checkCast<Format>()({
	[Inherit]: roomObjectFormat,
	[Variant]: 'creep',
	ageTime: 'int32',
	body: bodyFormat,
	fatigue: 'int16',
	hits: 'int16',
	name: 'string',
	owner: Id.format,
	// saying: ...
	store: storeFormat,
}));

export const AgeTime: unique symbol = Symbol('ageTime');

export class Creep extends RoomObject {
	get [Variant]() { return 'creep' }
	get carry() { return this.store }
	get carryCapacity() { return this.store.getCapacity() }
	get memory() {
		const memory = Memory.get();
		const creeps = memory.creeps ?? (memory.creeps = {});
		return creeps[this.name] ?? (creeps[this.name] = {});
	}
	get my() { return this[Owner] === gameContext.userId }
	get spawning() { return this[AgeTime] === 0 }
	get ticksToLive() { return this[AgeTime] === 0 ? undefined : this[AgeTime] - Game.time }

	harvest(source: Source) {
		if (!this.pos.isNearTo(source.pos)) {
			return C.ERR_NOT_IN_RANGE;
		} else if (source.energy <= 0) {
			return C.ERR_NOT_ENOUGH_RESOURCES;
		}
		gameContext.intents.save(this, 'harvest', { id: source.id });
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

	transfer(target: RoomObject) {
		if (!this.pos.isNearTo(target.pos)) {
			return C.ERR_NOT_IN_RANGE;
		} else if (this.carry.energy <= 0) {
			return C.ERR_NOT_ENOUGH_RESOURCES;
		}
		gameContext.intents.save(this, 'transfer', { id: target.id });
	}

	body!: FormatShape<typeof bodyFormat>;
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
