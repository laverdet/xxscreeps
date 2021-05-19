import type { Direction } from 'xxscreeps/game/position';
import type { GameConstructor } from 'xxscreeps/game';
import type { ResourceType } from 'xxscreeps/mods/resource/resource';
import type { RoomPath } from 'xxscreeps/game/room/path';
import type { RoomSearchOptions } from 'xxscreeps/game/path-finder';
import * as C from 'xxscreeps/game/constants';
import * as Fn from 'xxscreeps/utility/functional';
import * as Memory from 'xxscreeps/mods/memory/memory';
import * as Id from 'xxscreeps/engine/schema/id';
import * as ActionLog from 'xxscreeps/game/action-log';
import * as RoomObjectLib from 'xxscreeps/game/object';
import * as Store from 'xxscreeps/mods/resource/store';
import { Game, intents, me } from 'xxscreeps/game';
import { compose, declare, enumerated, optional, struct, variant, vector, withOverlay } from 'xxscreeps/schema';
import { RoomPosition, fetchPositionArgument } from 'xxscreeps/game/position';
import { chainIntentChecks, checkRange, checkSafeMode, checkTarget } from 'xxscreeps/game/checks';
import { assign } from 'xxscreeps/utility/utility';
import { registerObstacleChecker } from 'xxscreeps/game/path-finder';
import { Resource, optionalResourceEnumFormat } from 'xxscreeps/mods/resource/resource';
// eslint-disable-next-line @typescript-eslint/no-duplicate-imports
import { RoomObject } from 'xxscreeps/game/object';
import { Structure } from 'xxscreeps/mods/structure/structure';
import { Room } from 'xxscreeps/game/room';

export type PartType = typeof C.BODYPARTS_ALL[number];

type MoveToOptions = {
	noPathFinding?: boolean;
	reusePath?: number;
	serializeMemory?: boolean;
	visualizePathStyle?: boolean;
};

export const format = () => compose(shape, Creep);
function shape() {
	return declare('Creep', struct(RoomObjectLib.format, {
		...variant('creep'),
		...ActionLog.memberFormat(),
		body: vector(struct({
			boost: optionalResourceEnumFormat,
			hits: 'uint8',
			type: enumerated(...C.BODYPARTS_ALL),
		})),
		fatigue: 'int32',
		hits: 'int32',
		name: 'string',
		store: Store.format,
		'#saying': optional(struct({
			isPublic: 'bool',
			message: 'string',
		})),
		'#user': Id.format,
		'#ageTime': 'int32',
	}));
}

export class Creep extends withOverlay(RoomObject, shape) {
	get carry() { return this.store }
	get carryCapacity() { return this.store.getCapacity() }
	get hitsMax() { return this.body.length * 100 }
	get memory() {
		const memory = Memory.get();
		const creeps = memory.creeps ?? (memory.creeps = {});
		return creeps[this.name] ?? (creeps[this.name] = {});
	}

	get my() { return this['#user'] === me }
	get owner() { return this['#user'] }
	get spawning() { return this['#ageTime'] === 0 }
	get ticksToLive() { return Math.max(0, this['#ageTime'] - Game.time) || undefined }
	get ['#lookType']() { return C.LOOK_CREEPS }

	/**
	 * The text message that the creep was saying at the last tick.
	 */
	get saying() {
		const saying = this['#saying'];
		if (saying && (saying.isPublic || this['#user'] === me)) {
			return saying.message;
		}
	}

	['#addToMyGame'](game: GameConstructor) {
		game.creeps[this.name] = this;
	}

	['#runnerUser']() {
		return this['#user'];
	}

	/**
	 * Cancel the order given during the current game tick.
	 * @param methodName The name of a creep's method to be cancelled.
	 */
	cancelOrder(methodName: string) {
		return intents.remove(this, methodName as never);
	}

	/**
	 * Drop this resource on the ground.
	 * @param _resourceType One of the `RESOURCE_*` constants.
	 * @param _amount The amount of resource units to be dropped. If omitted, all the available
	 * carried amount is used.
	 */
	drop(resourceType: ResourceType, amount?: number) {
		// eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
		const intentAmount = amount || (this.store[resourceType] ?? 0);
		return chainIntentChecks(
			() => checkDrop(this, resourceType, intentAmount),
			() => intents.save(this, 'drop', resourceType, intentAmount));
	}

	/**
	 * Get the quantity of live body parts of the given type. Fully damaged parts do not count.
	 * @param type A body part type
	 */
	getActiveBodyparts(type: PartType) {
		return Fn.accumulate(this.body, part => part.type === type && part.hits > 0 ? 1 : 0);
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
			() => intents.save(this, 'move', direction));
	}

	/**
	 * Move the creep using the specified predefined path. Requires the `MOVE` body part.
	 * @param path A path value as returned from `Room.findPath`, `RoomPosition.findPathTo`, or
	 * `PathFinder.search` methods. Both array form and serialized string form are accepted.
	 */
	moveByPath(path: RoomPath | RoomPosition[] | string): C.ErrorCode {
		// Parse serialized path
		if (typeof path === 'string') {
			return this.moveByPath(Room.deserializePath(path));
		} else if (!Array.isArray(path)) {
			return C.ERR_INVALID_ARGS;
		}

		// Find current position
		type AnyPosition = RoomPosition | RoomPath[number];
		const convert = (entry: AnyPosition) =>
			entry instanceof RoomPosition ?
				entry : new RoomPosition(entry.x, entry.y, this.pos.roomName);
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
	moveTo(target: RoomObject | RoomPosition, opts?: MoveToOptions & RoomSearchOptions): number;
	moveTo(...args: [any]) {
		return chainIntentChecks(
			() => checkCommon(this),
			() => checkFatigue(this),
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

						} else if (_move.dest.room === pos.roomName && _move.dest.x === pos.x && _move.dest.y === pos.y) {

							const path = typeof _move.path === 'string' ? Room.deserializePath(_move.path) : _move.path;
							const ii = path.findIndex(pos => this.pos.x === pos.x && this.pos.y === pos.y);
							if (ii !== -1) {
								path.splice(0, ii + 1);
								_move.path = serializeMemory ? Room.serializePath(path) : path;
							}
							if (path.length === 0) {
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
						path: serializeMemory ? Room.serializePath(path) : path,
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

	/**
	 * Toggle auto notification when the structure is under attack. The notification will be sent to
	 * your account email. Turned on by default.
	 * @param enabled Whether to enable notification or disable.
	 */
	notifyWhenAttacked(_enabled = true) {}

	/**
	 * Pick up an item (a dropped piece of energy). Requires the `CARRY` body part. The target has to be
	 * at adjacent square to the creep or at the same square.
	 * @param resource The target object to be picked up
	 */
	pickup(this: Creep, resource: Resource) {
		return chainIntentChecks(
			() => checkPickup(this, resource),
			() => intents.save(this, 'pickup', resource.id));
	}

	/**
	 * Display a visual speech balloon above the creep with the specified message. The message will be
	 * available for one tick. You can read the last message using the `saying` property. Any valid
	 * Unicode characters are allowed, including emoji.
	 * @param message The message to be displayed. Maximum length is 10 characters.
	 * @param public Set to true to allow other players to see this message. Default is false.
	 */
	say(message: string, isPublic = true) {
		return chainIntentChecks(
			() => checkCommon(this),
			() => intents.save(this, 'say', `${message}`.substr(0, 10), isPublic));
	}

	/**
	 * Kill the creep immediately
	 */
	suicide(this: Creep) {
		return chainIntentChecks(
			() => checkCommon(this),
			() => intents.save(this, 'suicide'),
		);
	}

	/**
	 * Transfer resource from the creep to another object. The target has to be at adjacent square to
	 * the creep.
	 * @param target The target object
	 * @param resourceType One of the `RESOURCE_*` constants
	 * @param amount The amount of resources to be transferred. If omitted, all the available carried
	 * amount is used.
	 */
	transfer(this: Creep, target: RoomObject & Store.WithStore, resourceType: ResourceType, amount?: number) {
		const intentAmount = calculateAmount(this, target, () =>
			// eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
			amount || Math.min(this.store[resourceType] ?? 0, target.store.getFreeCapacity(resourceType)));
		return chainIntentChecks(
			() => checkTransfer(this, target, resourceType, intentAmount),
			() => intents.save(this, 'transfer', target.id, resourceType, intentAmount),
		);
	}

	/**
	 * Withdraw resources from a structure or tombstone. The target has to be at adjacent square to
	 * the creep. Multiple creeps can withdraw from the same object in the same tick. Your creeps can
	 * withdraw resources from hostile structures/tombstones as well, in case if there is no hostile
	 * rampart on top of it.
	 *
	 * This method should not be used to transfer resources between creeps. To transfer between
	 * creeps, use the `transfer` method on the original creep.
	 */
	withdraw(this: Creep, target: Structure & Store.WithStore, resourceType: ResourceType, amount?: number) {
		const intentAmount = calculateAmount(this, target, () =>
			// eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
			amount || Math.min(this.store.getFreeCapacity(resourceType), target.store[resourceType] ?? 0));
		return chainIntentChecks(
			() => checkWithdraw(this, target, resourceType, intentAmount),
			() => intents.save(this, 'withdraw', target.id, resourceType, intentAmount),
		);
	}
}

export function create(pos: RoomPosition, body: PartType[], name: string, owner: string) {
	const carryCapacity = body.reduce((energy, type) =>
		type === C.CARRY ? energy + C.CARRY_CAPACITY : energy, 0);
	const creep = assign(RoomObjectLib.create(new Creep, pos), {
		body: body.map(type => ({ type, hits: 100, boost: undefined })),
		hits: body.length * 100,
		fatigue: 0,
		name,
		store: Store.create(carryCapacity),
	});
	creep['#ageTime'] = 0;
	creep['#user'] = owner;
	return creep;
}

registerObstacleChecker(params => {
	const { room, user } = params;
	if (params.ignoreCreeps) {
		return null;
	} else if (room.controller?.safeMode === undefined) {
		return object => object instanceof Creep;
	} else {
		const safeUser = room.controller['#user'];
		return object => object instanceof Creep &&
			(object['#user'] === safeUser || object['#user'] !== user);
	}
});

//
// Intent checks
function calculateAmount(creep: Creep, target: RoomObject & Store.WithStore, fn: () => number) {
	// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
	if (creep instanceof Creep && target instanceof RoomObject && target.store) {
		return fn();
	} else {
		return NaN;
	}
}

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

function checkFatigue(creep: Creep) {
	return creep.fatigue > 0 ? C.ERR_TIRED : C.OK;
}

export function checkDrop(creep: Creep, resourceType: ResourceType, amount: number) {
	return chainIntentChecks(
		() => checkCommon(creep, C.MOVE),
		() => checkHasResource(creep, resourceType, amount));
}

export function checkMove(creep: Creep, direction: number) {
	return chainIntentChecks(
		() => checkCommon(creep, C.MOVE),
		() => checkFatigue(creep),
		() => direction >= 1 && direction <= 8 && Number.isInteger(direction) ?
			C.OK : C.ERR_INVALID_ARGS);
}

export function checkPickup(creep: Creep, target: Resource) {
	return chainIntentChecks(
		() => checkCommon(creep),
		() => checkTarget(target, Resource),
		() => checkRange(creep, target, 1),
		() => creep.store.getFreeCapacity(target.resourceType) > 0 ?
			C.OK : C.ERR_FULL);
}

function checkHasCapacity(target: RoomObject & Store.WithStore, resourceType: ResourceType, amount: number) {
	if (target.store.getFreeCapacity(resourceType) >= amount) {
		return C.OK;
	} else {
		return C.ERR_FULL;
	}
}

export function checkHasResource(target: RoomObject & Store.WithStore, resourceType: ResourceType, amount = 1) {
	if (!C.RESOURCES_ALL.includes(resourceType)) {
		return C.ERR_INVALID_ARGS;
	} else if (typeof amount !== 'number' || amount < 0) {
		return C.ERR_INVALID_ARGS;
	} else if (target.store[resourceType]! >= amount) {
		return C.OK;
	} else {
		return C.ERR_NOT_ENOUGH_RESOURCES;
	}
}

export function checkTransfer(creep: Creep, target: RoomObject & Store.WithStore, resourceType: ResourceType, amount: number) {
	return chainIntentChecks(
		() => checkCommon(creep),
		() => checkTarget(target, RoomObject),
		() => checkRange(creep, target, 1),
		() => checkHasResource(creep, resourceType, amount),
		() => checkHasCapacity(target, resourceType, amount),
		() => {
			if (target instanceof Creep && target.spawning) {
				return C.ERR_INVALID_TARGET;
			}
		});
}

export function checkWithdraw(creep: Creep, target: Structure & Store.WithStore, resourceType: ResourceType, amount: number) {
	return chainIntentChecks(
		() => checkCommon(creep),
		() => checkTarget(target, Structure),
		() => checkRange(creep, target, 1),
		() => checkHasResource(target, resourceType, amount),
		() => checkHasCapacity(creep, resourceType, amount),
		() => checkSafeMode(creep.room, C.ERR_NOT_OWNER));
}
