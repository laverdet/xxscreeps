import * as C from '~/game/constants';
import { gameContext } from '~/game/context';
import * as Memory from '~/game/memory';
import type { bodyFormat } from '~/engine/schema/creep';
import { FormatShape, Variant } from '~/lib/schema';
import { fetchPositionArgument, Direction, RoomPosition } from '../position';
import { Owner, RoomObject } from './room-object';
import { RoomObjectWithStore, Store } from '../store';
import { Source } from './source';
import { StructureController } from './structures/controller';
export { Owner };

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

	getActiveBodyparts(type: C.BodyPart) {
		return this.body.reduce((count, part) =>
			count + (part.type === type && part.hits > 0 ? 1 : 0), 0);
	}

	harvest(target: Source) {
		return chainChecks(
			() => checkHarvest(this, target),
			() => gameContext.intents.save(this, 'harvest', { target: target.id }));
	}

	move(direction: Direction) {
		return chainChecks(
			() => checkMove(this, direction),
			() => gameContext.intents.save(this, 'move', { direction }));
	}

	moveTo(x: number, y: number): number;
	moveTo(pos: RoomObject | RoomPosition): number;
	moveTo(...args: [any]) {
		return chainChecks(
			() => checkMoveCommon(this),
			() => {
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
			});
	}

	transfer(target: RoomObjectWithStore, resourceType: C.ResourceType, amount?: number) {
		return chainChecks(
			() => checkTransfer(this, target, resourceType, amount),
			() => gameContext.intents.save(this, 'transfer', { amount, resourceType, target: target.id }),
		);
	}

	say() {}
	upgradeController(target: StructureController) {
		return chainChecks(
			() => checkUpgradeController(this, target),
			() => gameContext.intents.save(this, 'upgradeController', { target: target.id }),
		);
	}

	body!: FormatShape<typeof bodyFormat>;
	fatigue!: number;
	hits!: number;
	name!: string;
	store!: Store;
	protected [AgeTime]!: number;
	protected [Owner]!: string;
}

//
// Intent checks
function chainChecks(...checks: (() => number)[]) {
	for (const check of checks) {
		const result = check();
		if (result !== C.OK) {
			return result;
		}
	}
	return C.OK;
}

function checkCommon(creep: Creep) {
	if (!creep.my) {
		return C.ERR_NOT_OWNER;
	} else if (creep.spawning) {
		return C.ERR_BUSY;
	}
	return C.OK;
}

export function checkHarvest(creep: Creep, target: RoomObject) {
	return chainChecks(
		() => checkCommon(creep),
		() => {
			if (creep.getActiveBodyparts(C.WORK) <= 0) {
				return C.ERR_NO_BODYPART;

			} else if (!(target instanceof RoomObject)) {
				return C.ERR_INVALID_TARGET;

			} else if (!creep.pos.isNearTo(target.pos)) {
				return C.ERR_NOT_IN_RANGE;
			}

			if (target instanceof Source) {
				if (target.energy <= 0) {
					return C.ERR_NOT_ENOUGH_RESOURCES;
				}
				return C.OK;
			}
			return C.ERR_INVALID_TARGET;
		});
}

export function checkMove(creep: Creep, direction: number) {
	return chainChecks(
		() => checkMoveCommon(creep),
		() => {
			if (!(direction >= 1 && direction <= 8)) {
				return C.ERR_INVALID_ARGS;
			}
			return C.OK;
		},
	);
}

function checkMoveCommon(creep: Creep) {
	return chainChecks(
		() => checkCommon(creep),
		() => {
			if (creep.fatigue > 0) {
				return C.ERR_TIRED;
			} else if (creep.getActiveBodyparts(C.MOVE) <= 0) {
				return C.ERR_NO_BODYPART;
			}
			return C.OK;
		});
}

export function checkTransfer(
	creep: Creep,
	target: RoomObject & Partial<RoomObjectWithStore> | undefined,
	resourceType: C.ResourceType,
	amount?: number,
) {
	return chainChecks(
		() => checkCommon(creep),
		() => {
			if (amount! < 0) {
				return C.ERR_INVALID_ARGS;

			} else if (!C.RESOURCES_ALL.includes(resourceType)) {
				return C.ERR_INVALID_ARGS;

			} else if (!(creep instanceof Creep) || !(target instanceof RoomObject)) {
				return C.ERR_INVALID_TARGET;

			} else if (target instanceof Creep && target.spawning) {
				return C.ERR_INVALID_TARGET;

			} else if (!target.store) {
				return C.ERR_INVALID_TARGET;
			}

			const targetCapacity = target.store.getCapacity(resourceType);
			if (targetCapacity === null) {
				return C.ERR_INVALID_TARGET;
			}

			if (!creep.pos.isNearTo(target.pos)) {
				return C.ERR_NOT_IN_RANGE;

			} else if (!(creep.store[resourceType]! >= 0)) {
				return C.ERR_NOT_ENOUGH_RESOURCES;
			}

			const targetFreeCapacity = target.store.getFreeCapacity(resourceType);
			if (!(targetFreeCapacity > 0)) {
				return C.ERR_FULL;
			}

			let tryAmount = amount;
			// eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
			if (!tryAmount) {
				tryAmount = Math.min(creep.store[resourceType]!, targetFreeCapacity);
			}

			if (!(tryAmount >= creep.store[resourceType]!)) {
				return C.ERR_NOT_ENOUGH_RESOURCES;
			}

			if (!(tryAmount <= targetFreeCapacity)) {
				return C.ERR_FULL;
			}

			return C.OK;
		});
}

export function checkUpgradeController(creep: Creep, target: StructureController) {
	return chainChecks(
		() => checkCommon(creep),
		() => {
			if (creep.getActiveBodyparts(C.WORK) <= 0) {
				return C.ERR_NO_BODYPART;

			} else if (creep.store.energy <= 0) {
				return C.ERR_NOT_ENOUGH_RESOURCES;

			} else if (!(target instanceof StructureController)) {
				return C.ERR_INVALID_TARGET;

			} else if (target.upgradeBlocked! > 0) {
				return C.ERR_INVALID_TARGET;

			} else if (!creep.pos.inRangeTo(target.pos, 3)) {
				return C.ERR_NOT_IN_RANGE;

			} else if (!target.my) {
				return C.ERR_NOT_OWNER;
			}

			return C.OK;
		});
}
