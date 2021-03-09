import type { RoomPath } from '../room/room';
import * as C from 'xxscreeps/game/constants';
import * as Game from 'xxscreeps/game/game';
import * as Memory from 'xxscreeps/game/memory';
import * as Id from 'xxscreeps/engine/schema/id';
import * as ActionLog from './action-log';
import * as RoomObject from '../object';
import * as Store from 'xxscreeps/mods/resource/store';
import { compose, declare, enumerated, member, struct, variant, vector, withOverlay } from 'xxscreeps/schema';
import { fetchPositionArgument, Direction, RoomPosition } from '../position';
import { chainIntentChecks } from 'xxscreeps/game/checks';
import { assign } from 'xxscreeps/utility/utility';
import { StructureController } from './structures/controller';
import { RoomSearchOptions, SearchReturn } from '../path-finder';
import { Resource, ResourceType, optionalResourceEnumFormat } from 'xxscreeps/mods/resource/resource';
import { Structure } from './structures';

export type PartType = typeof C.BODYPARTS_ALL[number];

type MoveToOptions = {
	noPathFinding?: boolean;
	reusePath?: number;
	serializeMemory?: boolean;
	visualizePathStyle?: boolean;
};

export function format() { return compose(shape, Creep) }
function shape() {
	return declare('Creep', struct(RoomObject.format, {
		...variant('creep'),
		...ActionLog.memberFormat(),
		body: vector(struct({
			boost: optionalResourceEnumFormat,
			hits: 'uint8',
			type: enumerated(...C.BODYPARTS_ALL),
		})),
		fatigue: 'int16',
		hits: 'int16',
		name: 'string',
		owner: member(RoomObject.Owner, Id.format),
		// saying: ...
		store: Store.format,
		_ageTime: 'int32',
	}));
}

export class Creep extends withOverlay(RoomObject.RoomObject, shape) {
	get carry() { return this.store }
	get carryCapacity() { return this.store.getCapacity() }
	get hitsMax() { return this.body.length * 100 }
	get memory() {
		const memory = Memory.get();
		const creeps = memory.creeps ?? (memory.creeps = {});
		return creeps[this.name] ?? (creeps[this.name] = {});
	}
	get my() { return this[RoomObject.Owner] === Game.me }
	get owner() { return this[RoomObject.Owner] }
	get spawning() { return this._ageTime === 0 }
	get ticksToLive() { return this._ageTime - Game.time }
	get [RoomObject.LookType]() { return C.LOOK_CREEPS }

	getActiveBodyparts(type: PartType) {
		return this.body.reduce((count, part) =>
			count + (part.type === type && part.hits > 0 ? 1 : 0), 0);
	}

	/**
	 * Move the creep one square in the specified direction. Requires the `MOVE` body part, or another
	 * creep nearby pulling the creep. In case if you call move on a creep nearby, the `ERR_TIRED` and
	 * the `ERR_NO_BODYPART` checks will be bypassed; otherwise, the `ERR_NOT_IN_RANGE` check will be
	 * bypassed.
	 */
	move(this: Creep, direction: Direction) {
		return chainIntentChecks(
			() => checkMove(this, direction),
			() => Game.intents.save(this, 'move', direction));
	}

	/**
	 * Move the creep using the specified predefined path. Requires the `MOVE` body part.
	 * @param path A path value as returned from `Room.findPath`, `RoomPosition.findPathTo`, or
	 * `PathFinder.search` methods. Both array form and serialized string form are accepted.
	 */
	moveByPath(path: RoomPath | SearchReturn['path'] | string): C.ErrorCode {
		// Parse serialized path
		if (typeof path === 'string') {
			return this.moveByPath(this.room.deserializePath(path));
		} else if (!Array.isArray(path)) {
			return C.ERR_INVALID_ARGS;
		}

		// Find current position
		type AnyPosition = RoomPosition | RoomPath[number];
		const convert = (entry: AnyPosition) =>
			entry instanceof RoomPosition ? entry :
			new RoomPosition(entry.x, entry.y, this.pos.roomName);
		let ii = path.findIndex((pos: AnyPosition) => this.pos.isEqualTo(convert(pos)));
		if (ii === -1 && !this.pos.isNearTo(convert(path[0]))) {
			return C.ERR_NOT_FOUND;
		}

		// Get next position
		if (++ii >= path.length) {
			return C.ERR_NOT_FOUND;
		}
		return this.move(this.pos.getDirectionTo(convert(path[ii])));
	}

	/**
	 * Find the optimal path to the target within the same room and move to it. A shorthand to
	 * consequent calls of `pos.findPathTo()` and `move()` methods. If the target is in another room,
	 * then the corresponding exit will be used as a target. Requires the `MOVE` body part.
	 * @param x X position in the same room
	 * @param y Y position in the same room
	 * @param target Can be a RoomObject or RoomPosition
	 */
	moveTo(x: number, y: number, opts?: MoveToOptions & RoomSearchOptions): number;
	moveTo(target: RoomObject.RoomObject | RoomPosition, opts?: MoveToOptions & RoomSearchOptions): number;
	moveTo(...args: [any]) {
		return chainIntentChecks(
			() => checkMoveCommon(this),
			() => {
				// Parse target
				const { pos, extra } = fetchPositionArgument<MoveToOptions>(this.pos.roomName, ...args);
				if (pos === undefined) {
					return C.ERR_INVALID_TARGET;
				} else if (pos.isEqualTo(this.pos)) {
					return C.OK;
				}

				// Reuse saved path
				const reusePath = extra?.reusePath ?? 5;
				const serializeMemory = extra?.serializeMemory ?? true;
				type SavedMove = {
					dest: {
						room: string;
						x: number;
						y: number;
					};
					path: string | RoomPath;
					room: string;
					time: number;
				};
				if (reusePath > 0) {
					const { _move }: { _move?: SavedMove } = this.memory;
					if (_move !== undefined) {
						if (Game.time > _move.time + reusePath || _move.room !== this.pos.roomName) {
							delete this.memory._move;

						} else if (_move.dest.room === pos.roomName && _move.dest.x == pos.x && _move.dest.y == pos.y) {

							const path = typeof _move.path === 'string' ? this.room.deserializePath(_move.path) : _move.path;
							const ii = path.findIndex(pos => this.pos.x === pos.x && this.pos.y === pos.y);
							if (ii !== -1) {
								path.splice(0, ii + 1);
								_move.path = serializeMemory ? this.room.serializePath(path) : path;
							}
							if (path.length == 0) {
								return this.pos.isNearTo(pos) ? C.OK : C.ERR_NO_PATH;
							}
							const result = this.moveByPath(path);
							if (result === C.OK) {
								return C.OK;
							}
						}
					}
				}

				// Find a path
				if (extra?.noPathFinding) {
					return C.ERR_NOT_FOUND;
				}
				const path = this.pos.findPathTo(pos);

				// Cache path in memory
				if (reusePath > 0) {
					const _move: SavedMove = {
						dest: {
							x: pos.x,
							y: pos.y,
							room: pos.roomName,
						},
						time: Game.time,
						path: serializeMemory ? this.room.serializePath(path) : path,
						room: this.pos.roomName,
					};
					this.memory._move = _move;
				}

				// And move one tile
				if (path.length === 0) {
					return C.ERR_NO_PATH;
				}
				return this.move(path[0].direction);
			});
	}

	pickup(this: Creep, resource: Resource) {
		return chainIntentChecks(
			() => checkPickup(this, resource),
			() => Game.intents.save(this, 'pickup', resource.id));
	}

	repair() {
		return C.ERR_INVALID_TARGET;
	}

	/**
	 * Kill the creep immediately
	 */
	suicide(this: Creep) {
		return chainIntentChecks(
			() => checkCommon(this),
			() => Game.intents.save(this, 'suicide'),
		);
	}

	transfer(this: Creep, target: Store.RoomObjectWithStore, resourceType: ResourceType, amount?: number) {
		return chainIntentChecks(
			() => checkTransfer(this, target, resourceType, amount),
			() => Game.intents.save(this, 'transfer', target.id, resourceType, amount),
		);
	}

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	say(message: string) {}
	upgradeController(this: Creep, target: StructureController) {
		return chainIntentChecks(
			() => checkUpgradeController(this, target),
			() => Game.intents.save(this, 'upgradeController', target.id),
		);
	}

	withdraw(this: Creep, target: Extract<Store.RoomObjectWithStore, Structure>, resourceType: ResourceType, amount?: number) {
		return chainIntentChecks(
			() => checkWithdraw(this, target, resourceType, amount),
			() => Game.intents.save(this, 'withdraw', target.id, resourceType, amount),
		);
	}

	_nextPosition?: RoomPosition; // processor temporary
}

export function create(pos: RoomPosition, body: PartType[], name: string, owner: string) {
	const carryCapacity = body.reduce((energy, type) =>
		(type === C.CARRY ? energy + C.CARRY_CAPACITY : energy), 0);
	return assign(RoomObject.create(new Creep, pos), {
		body: body.map(type => ({ type, hits: 100, boost: undefined })),
		hits: body.length * 100,
		name,
		store: Store.create(carryCapacity),
		[RoomObject.Owner]: owner,
	});
}

//
// Intent checks
export function checkCommon(creep: Creep, part?: PartType) {
	if (!creep.my) {
		return C.ERR_NOT_OWNER;
	} else if (creep.spawning) {
		return C.ERR_BUSY;
	} else if (part && creep.getActiveBodyparts(part) === 0) {
		return C.ERR_NO_BODYPART;
	}
	return C.OK;
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
		() => checkCommon(creep, C.MOVE),
		() => {
			if (creep.fatigue > 0) {
				return C.ERR_TIRED;
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
	target: Store.RoomObjectWithStore,
	resourceType: ResourceType,
	amount: number | null | undefined,
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
	target: Store.RoomObjectWithStore,
	resourceType: ResourceType,
	amount: number | null | undefined,
) {
	return chainIntentChecks(
		() => checkTransferOrWithdraw(creep, target, resourceType, amount),
		() => {
			if (!(target instanceof RoomObject.RoomObject)) {
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
	target: Extract<Store.RoomObjectWithStore, Structure>,
	resourceType: ResourceType,
	amount: number | null | undefined,
) {
	return chainIntentChecks(
		() => checkTransferOrWithdraw(creep, target, resourceType, amount),
		() => {
			if (!(target instanceof Structure) || !('store' in target)) {
				return C.ERR_INVALID_TARGET;

				/* } else if (target.my === false) {
				// TODO: Rampart
				return C.ERR_NOT_OWNER */

			} else if (!creep.room.controller?.my && creep.room.controller!.safeMode! > 0) {
				return C.ERR_NOT_OWNER;

				/* } else if (target.structureType === 'nuker' || target.structureType === 'powerBank') {
				return C.ERR_INVALID_TARGET; */

			// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
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
