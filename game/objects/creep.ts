import * as C from '~/game/constants';
import * as Game from '~/game/game';
import * as Memory from '~/game/memory';
import { withOverlay } from '~/lib/schema';
import type { shape } from '~/engine/schema/creep';
import { fetchPositionArgument, Direction, RoomPosition } from '../position';
import { ConstructionSite } from './construction-site';
import { chainIntentChecks, RoomObject } from './room-object';
import { Source } from './source';
import { StructureController } from './structures/controller';
import { obstacleTypes } from '../path-finder';
import type { RoomObjectWithStore } from '../store';
import { Resource, ResourceType } from './resource';
import { Structure } from './structures';

export class Creep extends withOverlay<typeof shape>()(RoomObject) {
	get carry() { return this.store }
	get carryCapacity() { return this.store.getCapacity() }
	get memory() {
		const memory = Memory.get();
		const creeps = memory.creeps ?? (memory.creeps = {});
		return creeps[this.name] ?? (creeps[this.name] = {});
	}
	get my() { return this._owner === Game.me }
	get spawning() { return this._ageTime === 0 }
	get ticksToLive() { return this._ageTime - Game.time }
	get _lookType() { return C.LOOK_CREEPS }

	build(target: ConstructionSite) {
		return chainIntentChecks(
			() => checkBuild(this, target),
			() => Game.intents.save(this, 'build', { target: target.id }));
	}

	getActiveBodyparts(type: C.BodyPart) {
		return this.body.reduce((count, part) =>
			count + (part.type === type && part.hits > 0 ? 1 : 0), 0);
	}

	harvest(target: Source) {
		return chainIntentChecks(
			() => checkHarvest(this, target),
			() => Game.intents.save(this, 'harvest', { target: target.id }));
	}

	move(direction: Direction) {
		return chainIntentChecks(
			() => checkMove(this, direction),
			() => Game.intents.save(this, 'move', { direction }));
	}

	moveTo(x: number, y: number): number;
	moveTo(pos: RoomObject | RoomPosition): number;
	moveTo(...args: [any]) {
		return chainIntentChecks(
			() => checkMoveCommon(this),
			() => {
				// Parse target
				const { pos } = fetchPositionArgument(this.pos.roomName, ...args);
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

	pickup(resource: Resource) {
		return chainIntentChecks(
			() => checkPickup(this, resource),
			() => Game.intents.save(this, 'pickup', resource.id));
	}

	repair() {
		return C.ERR_INVALID_TARGET;
	}

	transfer(target: RoomObjectWithStore, resourceType: ResourceType, amount?: number) {
		return chainIntentChecks(
			() => checkTransfer(this, target, resourceType, amount),
			() => Game.intents.save(this, 'transfer', { amount, resourceType, target: target.id }),
		);
	}

	say() {}
	upgradeController(target: StructureController) {
		return chainIntentChecks(
			() => checkUpgradeController(this, target),
			() => Game.intents.save(this, 'upgradeController', { target: target.id }),
		);
	}

	withdraw(target: Extract<RoomObjectWithStore, Structure>, resourceType: ResourceType, amount?: number) {
		return chainIntentChecks(
			() => checkWithdraw(this, target, resourceType, amount),
			() => Game.intents.save(this, 'withdraw', { amount, resourceType, target: target.id }),
		);
	}

	_nextPosition?: RoomPosition; // processor temporary
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

export function checkBuild(creep: Creep, target: ConstructionSite) {
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

			// A friendly creep sitting on top of a construction site for an obstacle structure prevents
			// `build`
			const { room } = target;
			if (obstacleTypes.has(target.structureType)) {
				const creepFilter = room.controller?.safeMode === undefined ? () => true : (creep: Creep) => creep.my;
				for (const creep of room.find(C.FIND_CREEPS)) {
					if (target.pos.isEqualTo(creep) && creepFilter(creep)) {
						return C.ERR_INVALID_TARGET;
					}
				}
			}
			return C.OK;
		});
}

export function checkHarvest(creep: Creep, target: Source) {
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

export function checkPickup(creep: Creep, target: Resource) {
	return chainIntentChecks(
		() => checkCommon(creep),
		() => {
			if (!(target instanceof Resource)) {
				return C.ERR_INVALID_TARGET;
			} else if (creep.store.getFreeCapacity(target.resourceType) === 0) {
				return C.ERR_FULL;
			} else if (!creep.pos.isNearTo(target)) {
				return C.ERR_NOT_IN_RANGE;
			}
			return C.OK;
		});
}

function checkTransferOrWithdraw(
	creep: Creep,
	target: RoomObjectWithStore,
	resourceType: ResourceType,
	amount?: number,
) {
	return chainIntentChecks(
		() => checkCommon(creep),
		() => {
			if (amount! < 0) {
				return C.ERR_INVALID_ARGS;

			} else if (!C.RESOURCES_ALL.includes(resourceType)) {
				return C.ERR_INVALID_ARGS;

			} else if (!creep.pos.isNearTo(target.pos)) {
				return C.ERR_NOT_IN_RANGE;
			}

			return C.OK;
		},
	);
}

export function checkTransfer(
	creep: Creep,
	target: RoomObjectWithStore,
	resourceType: ResourceType,
	amount?: number,
) {
	return chainIntentChecks(
		() => checkTransferOrWithdraw(creep, target, resourceType, amount),
		() => {
			if (!(target instanceof RoomObject)) {
				return C.ERR_INVALID_TARGET;

			} else if (target instanceof Creep && target.spawning) {
				return C.ERR_INVALID_TARGET;

			// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
			} else if (!target.store) {
				return C.ERR_INVALID_TARGET;
			}

			const creepAmount = creep.store[resourceType];
			// eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
			if (!creepAmount) {
				return C.ERR_NOT_ENOUGH_RESOURCES;
			}

			const targetFreeCapacity = target.store.getFreeCapacity(resourceType);
			if (Number.isNaN(targetFreeCapacity)) {
				return C.ERR_INVALID_TARGET;
			} else if (targetFreeCapacity <= 0) {
				return C.ERR_FULL;
			}

			// eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
			const tryAmount = amount ? amount : Math.min(creepAmount, targetFreeCapacity);
			if (tryAmount > creepAmount) {
				return C.ERR_NOT_ENOUGH_RESOURCES;

			} else if (tryAmount > targetFreeCapacity) {
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

export function checkWithdraw(
	creep: Creep,
	target: Extract<RoomObjectWithStore, Structure>,
	resourceType: ResourceType,
	amount?: number,
) {
	return chainIntentChecks(
		() => checkTransferOrWithdraw(creep, target, resourceType, amount),
		() => {
			if (!(target instanceof Structure) || !('store' in target)) {
				return C.ERR_INVALID_TARGET;

				/* } else if (target.my === false) {
				// TODO: Rampart
				return C.ERR_NOT_OWNER */

			// eslint-disable-next-line @typescript-eslint/no-non-null-asserted-optional-chain
			} else if (!creep.room.controller?.my && creep.room.controller?.safeMode! > 0) {
				return C.ERR_NOT_OWNER;

				/* } else if (target.structureType === 'nuker' || target.structureType === 'powerBank') {
				return C.ERR_INVALID_TARGET; */

			} else if (target.store.getCapacity(resourceType) === null /* && !(target instanceof Tombstone) */) {
				return C.ERR_INVALID_TARGET;
			}

			const capacity = creep.store.getFreeCapacity(resourceType);
			if (capacity <= 0) {
				return C.ERR_FULL;
			}

			// eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
			const tryAmount = amount ? amount : Math.min(capacity, target.store[resourceType] ?? 0);
			if (tryAmount > capacity) {
				return C.ERR_FULL;

			} else if (tryAmount === 0 || (target.store[resourceType] ?? 0) < tryAmount) {
				return C.ERR_NOT_ENOUGH_RESOURCES;
			}

			return C.OK;
		});
}
