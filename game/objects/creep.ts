import * as C from '~/game/constants';
import { gameContext } from '~/game/context';
import * as Memory from '~/game/memory';
import type { bodyFormat } from '~/engine/schema/creep';
import { FormatShape, Variant } from '~/lib/schema';
import { fetchPositionArgument, Direction, RoomPosition } from '../position';
import { ConstructionSite } from './construction-site';
import { chainIntentChecks, Owner, RoomObject } from './room-object';
import { Source } from './source';
import { StructureController } from './structures/controller';
import { obstacleTypes } from '../path-finder';
import { Objects } from '../room';
import type { RoomObjectWithStore, Store } from '../store';
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
	get ticksToLive() { return this[AgeTime] - Game.time }

	build(target: ConstructionSite) {
		return chainIntentChecks(
			() => checkBuild(this, target),
			() => gameContext.intents.save(this, 'build', { target: target.id }));
	}

	getActiveBodyparts(type: C.BodyPart) {
		return this.body.reduce((count, part) =>
			count + (part.type === type && part.hits > 0 ? 1 : 0), 0);
	}

	harvest(target: Source) {
		return chainIntentChecks(
			() => checkHarvest(this, target),
			() => gameContext.intents.save(this, 'harvest', { target: target.id }));
	}

	move(direction: Direction) {
		return chainIntentChecks(
			() => checkMove(this, direction),
			() => gameContext.intents.save(this, 'move', { direction }));
	}

	moveTo(x: number, y: number): number;
	moveTo(pos: RoomObject | RoomPosition): number;
	moveTo(...args: [any]) {
		return chainIntentChecks(
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
		return chainIntentChecks(
			() => checkTransfer(this, target, resourceType, amount),
			() => gameContext.intents.save(this, 'transfer', { amount, resourceType, target: target.id }),
		);
	}

	say() {}
	upgradeController(target: StructureController) {
		return chainIntentChecks(
			() => checkUpgradeController(this, target),
			() => gameContext.intents.save(this, 'upgradeController', { target: target.id }),
		);
	}

	body!: FormatShape<typeof bodyFormat>;
	fatigue!: number;
	hits!: number;
	name!: string;
	nextPosition?: RoomPosition; // processor temporary
	store!: Store;
	protected [AgeTime]!: number;
	protected [Owner]!: string;
}

//
// Intent checks
function checkCommon(creep: Creep) {
	if (!creep.my) {
		return C.ERR_NOT_OWNER;
	} else if (creep.spawning) {
		return C.ERR_BUSY;
	}
	return C.OK;
}

export function checkBuild(creep: Creep, target?: ConstructionSite) {
	return chainIntentChecks(
		() => checkCommon(creep),
		() => {
			if (creep.getActiveBodyparts(C.WORK) <= 0) {
				return C.ERR_NO_BODYPART;

			} else if (creep.carry.energy <= 0) {
				return C.ERR_NOT_ENOUGH_RESOURCES;

			} else if (!(target instanceof ConstructionSite)) {
				return C.ERR_INVALID_TARGET;

			} else if (!creep.pos.inRangeTo(target, 3)) {
				return C.ERR_NOT_IN_RANGE;
			}

			// You're not allowed to build if the structure that would be created would be an obstacle
			const { room } = target;
			if (obstacleTypes.has(target.structureType)) {
				const creepFilter = room.controller?.safeMode === undefined ? () => true : (creep: Creep) => creep.my;
				for (const object of room[Objects]) {
					if (
						target.pos.isEqualTo(object.pos) && (
							(object instanceof Creep && creepFilter(creep)) ||
							(obstacleTypes.has(object[Variant])))
					) {
						return C.ERR_INVALID_TARGET;
					}
				}
			}
			return C.OK;
		});
}

export function checkHarvest(creep: Creep, target?: RoomObject) {
	return chainIntentChecks(
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
	return chainIntentChecks(
		() => checkMoveCommon(creep),
		() => {
			if (!(direction >= 1 && direction <= 8) && Number.isInteger(direction)) {
				return C.ERR_INVALID_ARGS;
			}
			return C.OK;
		},
	);
}

function checkMoveCommon(creep: Creep) {
	return chainIntentChecks(
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
	return chainIntentChecks(
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
	return chainIntentChecks(
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
