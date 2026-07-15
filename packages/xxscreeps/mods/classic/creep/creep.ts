import type { ProcessorContext } from 'xxscreeps/engine/processor/room.js';
import type { Predicate } from 'xxscreeps/functional/predicate.js';
import type { GameConstructor } from 'xxscreeps/game/index.js';
import type { RoomSearchOptions } from 'xxscreeps/game/pathfinder/index.js';
import type { Direction } from 'xxscreeps/game/position.js';
import type { FindPathOptions, RoomPath } from 'xxscreeps/game/room/path.js';
import type { ResourceType } from 'xxscreeps/mods/classic/resource/resource.js';
import type { WithStore } from 'xxscreeps/mods/classic/resource/store.js';
import type { PolyStyle } from 'xxscreeps/mods/meta/visual/visual.js';
import { invertedNumericComparator } from 'xxscreeps/functional/comparator.js';
import { Fn } from 'xxscreeps/functional/fn.js';
import { chainIntentChecks, checkRange, checkSafeMode, checkTarget } from 'xxscreeps/game/checks.js';
import * as C from 'xxscreeps/game/constants/index.js';
import { Game, intents, me, userInfo } from 'xxscreeps/game/index.js';
import { RoomObject, createRoomObject, optionalExpiryTime, saveAction } from 'xxscreeps/game/object.js';
import { registerObstacleChecker } from 'xxscreeps/game/pathfinder/index.js';
import { RoomPosition, fetchPositionArgument } from 'xxscreeps/game/position.js';
import { appendEventLog } from 'xxscreeps/game/room/event-log.js';
import { Room } from 'xxscreeps/game/room/index.js';
import { StructureController } from 'xxscreeps/mods/classic/controller/controller.js';
import { Resource } from 'xxscreeps/mods/classic/resource/resource.js';
import { OpenStore, Store, calculateChecked, checkHasCapacity, checkHasResource, checkHasResourceAmount, checkResourceArgs, checkStoreAccepts } from 'xxscreeps/mods/classic/resource/store.js';
import { Ruin } from 'xxscreeps/mods/classic/structure/ruin.js';
import { Structure } from 'xxscreeps/mods/classic/structure/structure.js';
import * as Memory from 'xxscreeps/mods/meta/memory/memory.js';
import { withOverlay } from 'xxscreeps/schema/index.js';
import { assign } from 'xxscreeps/utility/utility.js';
import { creepShape } from './schema.js';
import { Tombstone } from './tombstone.js';

export type PartType = typeof C.BODYPARTS_ALL[number];
type BoostEffects = Partial<Record<string, number>>;
export type BoostsLookup = Partial<Record<string, Partial<Record<string, BoostEffects>>>>;

type MoveToOptions = FindPathOptions & {
	noPathFinding?: boolean;
	reusePath?: number;
	serializeMemory?: boolean;
	visualizePathStyle?: Partial<PolyStyle>;
};

interface SavedMoveStorage {
	dest: {
		room: string;
		x: number;
		y: number;
	};
	path: string | RoomPath;
	room: string;
	time: number;
}

/** @internal */
export interface SavedMoveSerialized extends SavedMoveStorage {
	path: string;
}

/** @internal */
export interface SavedMovePath extends SavedMoveStorage {
	path: RoomPath;
}

/** @internal */
type SavedMove = SavedMoveSerialized | SavedMovePath;

/**
 * Creeps are your units. Creeps can move, harvest energy, construct structures, attack another
 * creeps, and perform other actions. Each creep consists of up to 50 body parts.
 * @public
 * @see https://docs.screeps.com/api/#Creep
 */
export class Creep extends withOverlay(RoomObject, creepShape) {
	/** @internal — raw incoming damage this tick (before TOUGH reduction), always >= 0 */
	declare tickRawDamage: number | undefined;
	/** @internal — raw healing received this tick, always >= 0 */
	declare tickHealing: number | undefined;

	/**
	 * The maximum amount of hit points of the creep.
	 * @public
	 * @see https://docs.screeps.com/api/#Creep.hitsMax
	 */
	@enumerable override get hitsMax() { return this.body.length * 100; }

	/**
	 * An object with the creep's owner info containing the following properties: `username` — the
	 * name of the owner user.
	 * @public
	 * @see https://docs.screeps.com/api/#Creep.owner
	 */
	@enumerable get owner() { return userInfo.get(this['#user']); }

	/**
	 * Whether this creep is still being spawned.
	 * @public
	 * @see https://docs.screeps.com/api/#Creep.spawning
	 */
	@enumerable get spawning() { return this['#ageTime'] === 0; }

	/**
	 * The remaining amount of game ticks after which the creep will die.
	 * @public
	 * @see https://docs.screeps.com/api/#Creep.ticksToLive
	 */
	@enumerable get ticksToLive() { return optionalExpiryTime(this['#ageTime']); }

	/**
	 * Whether it is your creep or foe.
	 * @public
	 * @see https://docs.screeps.com/api/#Creep.my
	 */
	@enumerable override get my() { return this['#user'] === me; }

	/**
	 * The text message that the creep was saying at the last tick.
	 * @public
	 * @see https://docs.screeps.com/api/#Creep.saying
	 */
	@enumerable get saying() {
		const saying = this['#saying'];
		if (saying?.time === Game.time && (saying.isPublic || this.my)) {
			return saying.message;
		}
	}

	/**
	 * Alias for `Creep.store`.
	 * @public
	 * @deprecated
	 * @see https://docs.screeps.com/api/#Creep.store
	 */
	get carry() { return this.store; }

	/**
	 * Alias for `Creep.store.getCapacity()`.
	 * @public
	 * @deprecated
	 * @see https://docs.screeps.com/api/#Store.getCapacity
	 */
	get carryCapacity() { return this.store.getCapacity(); }

	/**
	 * A shorthand to `Memory.creeps[creep.name]`. You can use it for quick access the creep's
	 * specific memory data object.
	 * [Learn more about memory](https://docs.screeps.com/global-objects.html#Memory-object)
	 * @public
	 * @see https://docs.screeps.com/api/#Creep.memory
	 */
	get memory(): Record<string, unknown> | undefined {
		if (!this.my) {
			return;
		}
		return (Memory.get().creeps ??= {})[this.name] ??= {};
	}

	override get '#hasIntent'() { return true; }
	override get '#layer'() { return 0; }
	override get '#lookType'() { return C.LOOK_CREEPS; }
	override get '#providesVision'() { return true; }

	set memory(memory: Record<string, unknown>) {
		if (!this.my) {
			return;
		}
		(Memory.get().creeps ??= {})[this.name] ??= memory;
	}

	override '#addToMyGame'(game: GameConstructor) {
		game.creeps[this.name] = this;
	}

	override '#applyNukeImpact'() {
		this['#destroy'](C.EVENT_ATTACK_TYPE_NUKE);
	}

	override '#destroy'(type?: number) {
		appendEventLog(this.room, {
			event: C.EVENT_OBJECT_DESTROYED,
			objectId: this.id,
			type: 'creep',
		});
		return super['#destroy'](type);
	}

	override '#applyDamage'(power: number, _type: number, source?: RoomObject) {
		if (this.spawning) {
			return;
		}
		this.tickRawDamage = (this.tickRawDamage ?? 0) + power;
		if (source) {
			saveAction(this, 'attacked', source.pos);
		}
	}

	'#sendAttackNotify'(_context: ProcessorContext, _source: RoomObject | undefined) {}

	/**
	 * Cancel the order given during the current game tick.
	 * @param methodName The name of a creep's method to be cancelled.
	 * @returns One of the following codes: `OK`, `ERR_NOT_FOUND`
	 * @public
	 * @see https://docs.screeps.com/api/#Creep.cancelOrder
	 */
	cancelOrder(methodName: string) {
		return intents.remove(this, methodName as never);
	}

	/**
	 * Drop this resource on the ground.
	 * @param resourceType One of the `RESOURCE_*` constants.
	 * @param amount The amount of resource units to be dropped. If omitted, all the available carried
	 * amount is used.
	 * @returns One of the following codes: `OK`, `ERR_NOT_OWNER`, `ERR_BUSY`, `ERR_INVALID_ARGS`,
	 * `ERR_NOT_ENOUGH_RESOURCES`
	 * @public
	 * @see https://docs.screeps.com/api/#Creep.drop
	 */
	drop(resourceType: ResourceType, amount?: number) {
		const intentAmount = (amount ?? 0) || this.store[resourceType];
		return chainIntentChecks(
			() => checkDrop(this, resourceType, intentAmount),
			() => intents.save(this, 'drop', resourceType, intentAmount));
	}

	/**
	 * Get the quantity of live body parts of the given type. Fully damaged parts do not count.
	 * @param type A body part type, one of the following body part constants: `MOVE`, `WORK`,
	 * `CARRY`, `ATTACK`, `RANGED_ATTACK`, `HEAL`, `TOUGH`
	 * @returns A number representing the quantity of body parts.
	 * @public
	 * @see https://docs.screeps.com/api/#Creep.getActiveBodyparts
	 */
	getActiveBodyparts(type: PartType) {
		return Fn.accumulate(iterateActiveParts(this.body), part => part.type === type ? 1 : 0);
	}

	/**
	 * Move the creep one square in the specified direction. Requires the `MOVE` body part, or another
	 * creep nearby [pulling](https://docs.screeps.com/api/#Creep.pull) the creep. In case if you call
	 * `move` on a creep nearby, the `ERR_TIRED` and the `ERR_NO_BODYPART` checks will be bypassed;
	 * otherwise, the `ERR_NOT_IN_RANGE` check will be bypassed.
	 * @param target A creep nearby, or one of the following constants: `TOP`, `TOP_RIGHT`, `RIGHT`,
	 * `BOTTOM_RIGHT`, `BOTTOM`, `BOTTOM_LEFT`, `LEFT`, `TOP_LEFT`
	 * @returns One of the following codes: `OK`, `ERR_NOT_OWNER`, `ERR_BUSY`, `ERR_TIRED`,
	 * `ERR_NO_BODYPART`, `ERR_INVALID_ARGS`, `ERR_NOT_IN_RANGE`
	 * @public
	 * @see https://docs.screeps.com/api/#Creep.move
	 */
	move(this: Creep, target: Direction | Creep) {
		return chainIntentChecks(
			() => checkMove(this, target),
			() => intents.save(this, 'move', typeof target === 'number' ? target : target.id));
	}

	/**
	 * Move the creep using the specified predefined path. Requires the `MOVE` body part.
	 * @param path A path value as returned from
	 * [`Room.findPath`](https://docs.screeps.com/api/#Room.findPath),
	 * [`RoomPosition.findPathTo`](https://docs.screeps.com/api/#RoomPosition.findPathTo), or
	 * [`PathFinder.search`](https://docs.screeps.com/api/#PathFinder.search) methods. Both array form
	 * and serialized string form are accepted.
	 * @returns One of the following codes: `OK`, `ERR_NOT_OWNER`, `ERR_BUSY`, `ERR_NOT_FOUND`,
	 * `ERR_INVALID_ARGS`, `ERR_TIRED`, `ERR_NO_BODYPART`
	 * @public
	 * @see https://docs.screeps.com/api/#Creep.moveByPath
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
			entry instanceof RoomPosition
				? entry : new RoomPosition(entry.x, entry.y, this.pos.roomName);
		let ii = path.findIndex((pos: AnyPosition) => this.pos.isEqualTo(convert(pos)));
		if (ii === -1 && !this.pos.isNearTo(convert(path[0]!))) {
			return C.ERR_NOT_FOUND;
		}

		// Get next position
		if (++ii >= path.length) {
			return C.ERR_NOT_FOUND;
		}
		return this.move(this.pos.getDirectionTo(convert(path[ii]!)));
	}

	/**
	 * Find the optimal path to the target within the same room and move to it. A shorthand to
	 * consequent calls of [`pos.findPathTo()`](https://docs.screeps.com/api/#RoomPosition.findPathTo)
	 * and [`move()`](https://docs.screeps.com/api/#Creep.move) methods. If the target is in another
	 * room, then the corresponding exit will be used as a target. Requires the `MOVE` body part.
	 * @param x X position of the target in the same room.
	 * @param y Y position of the target in the same room.
	 * @param target Can be a [RoomPosition](https://docs.screeps.com/api/#RoomPosition) object or any
	 * object containing RoomPosition. The position doesn't have to be in the same room with the
	 * creep.
	 * @param opts An object containing additional options:
	 * - `reusePath` — This option enables reusing the path found along multiple game ticks. It allows
	 *   to save CPU time, but can result in a slightly slower creep reaction behavior. The path is
	 *   stored into the creep's memory to the `_move` property. The `reusePath` value defines the
	 *   amount of ticks which the path should be reused for. The default value is 5. Increase the
	 *   amount to save more CPU, decrease to make the movement more consistent. Set to 0 if you want
	 *   to disable path reusing.
	 * - `serializeMemory` — If `reusePath` is enabled and this option is set to true, the path will
	 *   be stored in memory in the short serialized form using
	 *   [`Room.serializePath`](https://docs.screeps.com/api/#Room.serializePath). The default value
	 *   is true.
	 * - `noPathFinding` — If this option is set to true, `moveTo` method will return `ERR_NOT_FOUND`
	 *   if there is no memorized path to reuse. This can significantly save CPU time in some cases.
	 *   The default value is false.
	 * - `visualizePathStyle` — Draw a line along the creep's path using
	 *   [`RoomVisual.poly`](https://docs.screeps.com/api/#RoomVisual.poly). You can provide either an
	 *   empty object or custom style parameters.
	 * - Any options supported by [`Room.findPath`](https://docs.screeps.com/api/#Room.findPath)
	 *   method.
	 * @returns One of the following codes: `OK`, `ERR_NOT_OWNER`, `ERR_BUSY`, `ERR_TIRED`,
	 * `ERR_NO_BODYPART`, `ERR_INVALID_TARGET`, `ERR_NO_PATH`, `ERR_NOT_FOUND`
	 * @public
	 * @see https://docs.screeps.com/api/#Creep.moveTo
	 */
	moveTo(x: number, y: number, opts?: MoveToOptions & RoomSearchOptions): number;
	moveTo(target: RoomObject | RoomPosition, opts?: MoveToOptions & RoomSearchOptions): number;
	moveTo(...args: [any]) {
		// Parse target
		const { pos, extra } = fetchPositionArgument<MoveToOptions>(this.pos.roomName, ...args);
		if (pos === undefined) {
			return C.ERR_INVALID_TARGET;
		} else if (pos.isEqualTo(this.pos)) {
			return C.OK;
		}

		const searchOrFetchPath = () => {
			// Reuse saved path
			const reusePath = extra?.reusePath ?? 5;
			const serializeMemory = extra?.serializeMemory ?? true;
			if (reusePath > 0) {
				const { _move } = this.memory as { _move?: SavedMove };
				if (_move !== undefined) {
					if (Game.time > _move.time + reusePath || _move.room !== this.pos.roomName) {
						delete this.memory!._move;
					} else if (_move.dest.room === pos.roomName && _move.dest.x === pos.x && _move.dest.y === pos.y) {
						const path = typeof _move.path === 'string' ? Room.deserializePath(_move.path) : _move.path;
						const ii = path.findIndex(pos => this.pos.x === pos.x && this.pos.y === pos.y);
						if (ii !== -1) {
							path.splice(0, ii + 1);
							_move.path = serializeMemory ? Room.serializePath(path) : path;
						}
						const [ next ] = path;
						if (next === undefined || this.pos.isNearTo(next.x, next.y)) {
							return path;
						}
					}
				}
			}

			// Find a path
			if (extra?.noPathFinding) {
				return null;
			}
			const path = this.pos.findPathTo(pos, extra && {
				...extra,
				serialize: false,
			});

			// Cache path in memory
			if (reusePath > 0) {
				(this.memory as { _move?: SavedMoveStorage })._move = {
					dest: {
						x: pos.x,
						y: pos.y,
						room: pos.roomName,
					},
					time: Game.time,
					path: serializeMemory ? Room.serializePath(path) : path,
					room: this.pos.roomName,
				};
			}
			return path;
		};

		const visualize = (path: RoomPath) => {
			if (path.length > 0 && extra?.visualizePathStyle) {
				this.room.visual.poly(path, {
					fill: 'transparent',
					lineStyle: 'dashed',
					opacity: 0.1,
					stroke: '#fff',
					strokeWidth: 0.15,
					...extra.visualizePathStyle,
				});
			}
		};

		// Run intent checks & visualize path before returning a failure code
		const result = chainIntentChecks(
			() => checkCommon(this),
			() => checkFatigue(this));
		if (result !== C.OK) {
			if (result === C.ERR_TIRED) {
				const maybePath = searchOrFetchPath();
				if (maybePath) {
					visualize(maybePath);
				}
			}
			return result;
		}

		// Move to the target
		const path = searchOrFetchPath();
		if (!path) {
			return C.ERR_NOT_FOUND;
		}
		visualize(path);
		const [ next ] = path;
		if (next === undefined) {
			return this.pos.isNearTo(pos) ? C.OK : C.ERR_NO_PATH;
		} else {
			return this.move(next.direction);
		}
	}

	/**
	 * Pick up an item (a dropped piece of energy). Requires the `CARRY` body part. The target has to
	 * be at adjacent square to the creep or at the same square.
	 * @param resource The target object to be picked up.
	 * @returns One of the following codes: `OK`, `ERR_NOT_OWNER`, `ERR_BUSY`, `ERR_INVALID_TARGET`,
	 * `ERR_FULL`, `ERR_NOT_IN_RANGE`
	 * @public
	 * @see https://docs.screeps.com/api/#Creep.pickup
	 */
	pickup(this: Creep, resource: Resource) {
		return chainIntentChecks(
			() => checkPickup(this, resource),
			() => intents.save(this, 'pickup', resource.id));
	}

	/**
	 * Help another creep to follow this creep. The fatigue generated for the target's move will be
	 * added to the creep instead of the target. Requires the `MOVE` body part. The target has to be
	 * at adjacent square to the creep. The creep must
	 * [move](https://docs.screeps.com/api/#Creep.move) elsewhere, and the target must move towards
	 * the creep.
	 * @param target The target creep.
	 * @returns One of the following codes: `OK`, `ERR_NOT_OWNER`, `ERR_BUSY`, `ERR_INVALID_TARGET`,
	 * `ERR_NOT_IN_RANGE`
	 * @public
	 * @see https://docs.screeps.com/api/#Creep.pull
	 */
	pull(this: Creep, target: Creep) {
		return chainIntentChecks(
			() => checkPull(this, target),
			() => intents.save(this, 'pull', target.id));
	}

	/**
	 * Display a visual speech balloon above the creep with the specified message. The message will be
	 * available for one tick. You can read the last message using the `saying` property. Any valid
	 * Unicode characters are allowed, including
	 * [emoji](http://unicode.org/emoji/charts/emoji-style.txt).
	 * @param message The message to be displayed. Maximum length is 10 characters.
	 * @param isPublic Set to true to allow other players to see this message. Default is false.
	 * @returns One of the following codes: `OK`, `ERR_NOT_OWNER`, `ERR_BUSY`
	 * @public
	 * @see https://docs.screeps.com/api/#Creep.say
	 */
	say(message: string, isPublic = false) {
		return chainIntentChecks(
			() => checkCommon(this),
			() => intents.save(this, 'say', String(message).substring(0, 10), isPublic));
	}

	/**
	 * Kill the creep immediately.
	 * @returns One of the following codes: `OK`, `ERR_NOT_OWNER`, `ERR_BUSY`
	 * @public
	 * @see https://docs.screeps.com/api/#Creep.suicide
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
	 * @param target The target object.
	 * @param resourceType One of the `RESOURCE_*` constants.
	 * @param amount The amount of resources to be transferred. If omitted, all the available carried
	 * amount is used.
	 * @returns One of the following codes: `OK`, `ERR_NOT_OWNER`, `ERR_BUSY`,
	 * `ERR_NOT_ENOUGH_RESOURCES`, `ERR_INVALID_TARGET`, `ERR_FULL`, `ERR_NOT_IN_RANGE`,
	 * `ERR_INVALID_ARGS`
	 * @public
	 * @see https://docs.screeps.com/api/#Creep.transfer
	 */
	transfer(this: Creep, target: RoomObject & WithStore, resourceType: ResourceType, amount?: number) {
		if (target instanceof StructureController && resourceType === C.RESOURCE_ENERGY) {
			return this.upgradeController(target);
		}
		const intentAmount = calculateChecked(this, target, () =>
			// eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
			amount || Math.min(this.store[resourceType], target.store.getFreeCapacity(resourceType)!));
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
	 * creeps, use the [`transfer`](https://docs.screeps.com/api/#Creep.transfer) method on the
	 * original creep.
	 * @param target The target object.
	 * @param resourceType One of the `RESOURCE_*` constants.
	 * @param amount The amount of resources to be transferred. If omitted, all the available amount
	 * is used.
	 * @returns One of the following codes: `OK`, `ERR_NOT_OWNER`, `ERR_BUSY`,
	 * `ERR_NOT_ENOUGH_RESOURCES`, `ERR_INVALID_TARGET`, `ERR_FULL`, `ERR_NOT_IN_RANGE`,
	 * `ERR_INVALID_ARGS`
	 * @public
	 * @see https://docs.screeps.com/api/#Creep.withdraw
	 */
	withdraw(this: Creep, target: Structure & WithStore, resourceType: ResourceType, amount?: number) {
		const intentAmount = calculateChecked(this, target, () =>
			(amount ?? 0) || Math.min(this.store.getFreeCapacity(resourceType), target.store[resourceType]));
		return chainIntentChecks(
			() => checkWithdraw(this, target, resourceType, intentAmount),
			() => intents.save(this, 'withdraw', target.id, resourceType, intentAmount),
		);
	}
}

export function create(pos: RoomPosition, parts: PartType[], name: string, owner: string) {
	const body = parts.map(type => ({ type, hits: 100, boost: undefined }));
	const creep = assign(createRoomObject(new Creep(), pos), {
		body,
		hits: body.length * 100,
		fatigue: 0,
		name,
		store: OpenStore['#create'](calculateCarry(body)),
	});
	// age time is inaccurate, this will be reset in StructureSpawn code. This just helps with test scripts.
	creep['#ageTime'] = Game.time + C.CREEP_LIFE_TIME;
	creep['#user'] = owner;
	return creep;
}

export function calculateCarry(body: Creep['body']) {
	const boosts: BoostsLookup = C.BOOSTS;
	return Fn.accumulate(
		iterateActiveParts(body),
		part => {
			if (part.type !== C.CARRY) return 0;
			if (part.boost) {
				const multiplier = boosts[C.CARRY]?.[part.boost]?.capacity;
				if (multiplier !== undefined) {
					return C.CARRY_CAPACITY * multiplier;
				}
			}
			return C.CARRY_CAPACITY;
		});
}

const activePartPredicate: Predicate<Creep['body'][number]> = part => part.hits > 0;

export function iterateActiveParts(body: Creep['body']) {
	return Fn.filter(body, activePartPredicate);
}

registerObstacleChecker(params => {
	const { room, user } = params;
	if (params.ignoreCreeps) {
		return null;
	} else if (room.controller?.safeMode === undefined) {
		return object => object instanceof Creep;
	} else {
		const safeUser = room.controller['#user'];
		if (safeUser !== user) {
			return object => object instanceof Creep;
		}
		return object => object instanceof Creep && object['#user'] === user;
	}
});

//
// Intent checks
export function checkCommon(creep: Creep, part?: PartType) {
	if (!creep.my) {
		return C.ERR_NOT_OWNER;
	} else if (creep.spawning) {
		return C.ERR_BUSY;
	} else if (part && creep.getActiveBodyparts(part) === 0) {
		return C.ERR_NO_BODYPART;
	} else if (!(creep.room as unknown)) {
		return C.ERR_INVALID_ARGS;
	}
	return C.OK;
}

function checkFatigue(creep: Creep) {
	return creep.fatigue > 0 ? C.ERR_TIRED : C.OK;
}

export function checkDrop(creep: Creep, resourceType: ResourceType, amount: number) {
	return chainIntentChecks(
		() => checkCommon(creep),
		() => checkHasResource(creep, resourceType, amount));
}

export function checkMove(creep: Creep, target: Direction | Creep | null) {
	return chainIntentChecks(
		target instanceof Creep
			? () => chainIntentChecks(
				() => checkCommon(creep),
				() => checkRange(creep, target, 1)) :
			() => chainIntentChecks(
				() => checkCommon(creep, C.MOVE),
				() => checkFatigue(creep),
				() => Number.isInteger(target) && target! >= 1 && target! <= 8
					? C.OK : C.ERR_INVALID_ARGS));
}

export function checkPull(creep: Creep, target: Creep | null | undefined) {
	return chainIntentChecks(
		() => checkCommon(creep),
		() => checkTarget(target, Creep),
		() => target === creep ? C.ERR_INVALID_TARGET : C.OK,
		() => checkRange(creep, target!, 1),
		() => target!.spawning ? C.ERR_INVALID_TARGET : C.OK);
}

export function checkPickup(creep: Creep, target: Resource) {
	return chainIntentChecks(
		() => checkCommon(creep),
		() => checkTarget(target, Resource),
		() => creep.store.getFreeCapacity(target.resourceType) > 0
			? C.OK : C.ERR_FULL,
		() => checkRange(creep, target, 1));
}

function checkTransferTarget(target: RoomObject & WithStore, resourceType: ResourceType) {
	return chainIntentChecks(
		() => checkTarget(target, RoomObject),
		() => target.store instanceof Store ? C.OK : C.ERR_INVALID_TARGET,
		() => target instanceof Creep && target.spawning ? C.ERR_INVALID_TARGET : C.OK,
		() => checkStoreAccepts(target, resourceType));
}

export function checkTransfer(creep: Creep, target: RoomObject & WithStore, resourceType: ResourceType, amount: number) {
	return chainIntentChecks(
		() => checkCommon(creep),
		() => checkResourceArgs(resourceType, amount),
		() => checkTransferTarget(target, resourceType),
		() => checkRange(creep, target, 1),
		() => {
			const have = creep.store[resourceType];
			const free = target.store.getFreeCapacity(resourceType)!;
			if (have <= 0) return C.ERR_NOT_ENOUGH_RESOURCES;
			if (free <= 0) return C.ERR_FULL;
			if (have < amount) return C.ERR_NOT_ENOUGH_RESOURCES;
			if (free < amount) return C.ERR_FULL;
		});
}

export function checkWithdraw(creep: Creep, target: Structure & WithStore, resourceType: ResourceType, amount: number) {
	return chainIntentChecks(
		() => checkCommon(creep),
		() => checkResourceArgs(resourceType, amount),
		() => checkTarget(target, Ruin, Structure, Tombstone),
		() => checkInteractionBlocked(creep, target),
		() => checkSafeMode(creep.room, C.ERR_NOT_OWNER),
		() => target.store['#doesAllowWithdraw']() ? C.OK : C.ERR_INVALID_TARGET,
		() => checkStoreAccepts(target, resourceType),
		() => checkRange(creep, target, 1),
		() => checkHasCapacity(creep, resourceType, amount),
		() => checkHasResourceAmount(target, resourceType, amount));
}

function checkInteractionBlocked(creep: Creep, target: Structure & WithStore) {
	const user = creep['#user'];
	const blocked = target.room.lookForAt(C.LOOK_STRUCTURES, target.pos)
		.some(structure => structure['#doesPreventInteraction'](user));
	return blocked ? C.ERR_NOT_OWNER : C.OK;
}

export function calculateCost(creep: Creep) {
	return Fn.accumulate(creep.body, bodyPart => C.BODYPART_COST[bodyPart.type]);
}

export function calculatePower(creep: Creep, part: PartType, power: number, boostMethod?: string) {
	const boosts: BoostsLookup = C.BOOSTS;
	return Fn.accumulate(iterateActiveParts(creep.body), bodyPart => {
		if (bodyPart.type === part) {
			if (boostMethod !== undefined && bodyPart.boost) {
				const multiplier = boosts[part]?.[bodyPart.boost]?.[boostMethod];
				if (multiplier !== undefined) {
					return power * multiplier;
				}
			}
			return power;
		}
		return 0;
	});
}

/**
 * Split the unboosted (energy-cost-driving) effect from the boosted (output)
 * effect for per-WORK-part-per-tick actions like build, repair, and
 * upgradeController. Mirrors vanilla's behavior:
 *  - unboosted effect = active-part count × `power`, capped by `cap`
 *  - boosted effect = unboosted + sum(top-k boost deltas), where k = floor(
 *    unboosted / power) so an energy-limited creep only applies its most-
 *    boosted parts.
 *
 * Callers use `unboosted` as the energy basis (matching vanilla's
 * `buildEffect`/`repairEffect`/`_upgraded` accounting) and `boosted` as the
 * progress/hits applied to the target.
 */
export function calculateBoundedEffect(
	creep: Creep, part: PartType, power: number, boostMethod: string, cap: number,
) {
	const boosts: BoostsLookup = C.BOOSTS;
	const deltas: number[] = [];
	for (const bodyPart of iterateActiveParts(creep.body)) {
		if (bodyPart.type === part) {
			deltas.push(function() {
				if (bodyPart.boost) {
					const multiplier = boosts[part]?.[bodyPart.boost]?.[boostMethod];
					if (multiplier !== undefined && multiplier > 0) {
						return (multiplier - 1) * power;
					}
				}
				return 0;
			}());
		}
	}
	const unboosted = Math.min(deltas.length * power, cap);
	if (unboosted <= 0) {
		return { unboosted: 0, boosted: 0 };
	}
	deltas.sort(invertedNumericComparator);
	// Vanilla slices by the effect value (in power-units) rather than part
	// count. Since `deltas.length * power >= unboosted` and `power >= 1` for
	// all callers, slicing by `unboosted` keeps all parts when energy is
	// sufficient and the top-k most-boosted parts otherwise.
	const sliceCount = Math.floor(unboosted);
	const boostedDelta = Fn.accumulate(Fn.slice(deltas, 0, sliceCount));
	return { unboosted, boosted: Math.floor(unboosted + boostedDelta) };
}

export function calculateWeight(creep: Creep) {
	return Fn.pipe(
		creep.body,
		$$ => Fn.accumulate($$, part => part.type === C.CARRY || part.type === C.MOVE ? 0 : 1),
		$$ => $$ + Math.ceil(creep.carry.getUsedCapacity() / C.CARRY_CAPACITY));
}
