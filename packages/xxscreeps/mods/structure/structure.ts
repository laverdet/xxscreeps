import type { GameConstructor } from 'xxscreeps/game/index.js';
import type { RoomPosition } from 'xxscreeps/game/position.js';
import type { AnyRoomObject, Room } from 'xxscreeps/game/room/index.js';
import * as Id from 'xxscreeps/engine/schema/id.js';
import { mappedNumericComparator } from 'xxscreeps/functional/comparator.js';
import { chainIntentChecks } from 'xxscreeps/game/checks.js';
import * as C from 'xxscreeps/game/constants/index.js';
import { Game, hooks, intents, me, userInfo } from 'xxscreeps/game/index.js';
import { RoomObject, getById, format as objectFormat } from 'xxscreeps/game/object.js';
import { registerObstacleChecker } from 'xxscreeps/game/pathfinder/index.js';
import { isBorder, isNearBorder, iterateNeighbors } from 'xxscreeps/game/position.js';
import { appendEventLog } from 'xxscreeps/game/room/event-log.js';
import { compose, declare, optional, struct, withOverlay } from 'xxscreeps/schema/index.js';
import { assign } from 'xxscreeps/utility/utility.js';
import { createRuin } from './ruin.js';

export type AnyStructure = Extract<AnyRoomObject, Structure>;

export interface DestructibleStructure extends Structure {
	hits: number;
	hitsMax: number;
}

export const structureFormat = declare('Structure', () => compose(shape, Structure));
const shape = struct(objectFormat, {
	'#noAttackNotify': 'bool',
});

export const ownedStructureFormat = declare('OwnedStructure', () => compose(ownedShape, OwnedStructure));
const ownedShape = struct(structureFormat, {
	'#user': Id.optionalFormat,
	// TODO: Rename to '#inactive' so default 0 value = active (true). optional('bool') takes
	// 2 bytes; should not be lazy.
	'#active': optional('bool'),
});

/**
 * The base prototype object of all structures.
 */
export class Structure extends withOverlay(RoomObject, shape) {

	constructor(idOrArg1?: any, arg2?: any) {
		super(idOrArg1, arg2);
		if (typeof idOrArg1 === 'string') assign<Structure>(this, getById(Structure, idOrArg1));
	}

	/**
	 * One of the `STRUCTURE_*` constants.
	 */
	@enumerable get structureType(): string { throw new Error(); }

	/**
	 * The current amount of hit points of the structure.
	 */
	@enumerable override get hits(): number | undefined { return undefined; }

	/**
	 * The total amount of hit points of the structure.
	 */
	@enumerable override get hitsMax(): number | undefined { return undefined; }

	get '#lookType'() { return C.LOOK_STRUCTURES; }

	override set hits(_hits: number | undefined) { throw new Error('Adjusting hits on invulnerable structure'); }

	/**
	 * Destroy this structure immediately.
	 */
	destroy(this: Structure) {
		return chainIntentChecks(
			() => checkDestroy(this),
			() => intents.save(this, 'destroyStructure'));
	}

	/**
	 * Check whether this structure can be used. If room controller level is insufficient, then this
	 * method will return false, and the structure will be highlighted with red in the game.
	 */
	isActive(): boolean {
		return true;
	}

	/**
	 * Toggle notifications for when this structure is attacked.
	 * @param notifyWhenAttacked Whether to receive email notifications on attack.
	 */
	notifyWhenAttacked(this: Structure, notifyWhenAttacked: boolean) {
		return chainIntentChecks(
			() => checkNotifyWhenAttacked(this, notifyWhenAttacked),
			() => {
				if (notifyWhenAttacked === this['#noAttackNotify']) {
					intents.save(this, 'notifyWhenAttacked', Boolean(notifyWhenAttacked));
				}
			});
	}

	'#checkObstacle'(_user: string) {
		return true;
	}

	override '#destroy'() {
		if (super['#destroy']()) {
			this.room['#insertObject'](createRuin(this));
			appendEventLog(this.room, {
				event: C.EVENT_OBJECT_DESTROYED,
				objectId: this.id,
				type: this.structureType,
			});
			return true;
		} else {
			return false;
		}
	}
}

/**
 * The base prototype for a structure that has an owner. Such structures can be found using
 * `FIND_MY_STRUCTURES` and `FIND_HOSTILE_STRUCTURES` constants.
 */
export class OwnedStructure extends withOverlay(Structure, ownedShape) {
	/**
	 * An object with the structure's owner info
	 */
	@enumerable get owner() { return userInfo.get(this['#user']!); }

	/**
	 * Whether this is your own structure.
	 */
	@enumerable override get my() { return this['#user'] === me; }

	override get '#hasIntent'() { return true; }
	override get '#providesVision'() { return true; }

	// TODO: This may be invoked each tick until the processor calls isActive. The cache
	// does not persist from runner into processor, only from processor into runtime.
	override isActive() {
		if (this['#active'] === undefined) {
			checkActiveStructures(this.room);
		}
		return this['#active'] ?? true;
	}

	override '#destroy'() {
		if (super['#destroy']()) {
			// Invalidate active flags for same-type structures so the lazy
			// fallback in isActive() recomputes after this structure is flushed
			const type = this.structureType;
			for (const object of this.room['#objects']) {
				if (object instanceof OwnedStructure && object.structureType === type) {
					object['#active'] = undefined;
				}
			}
			return true;
		}
		return false;
	}

	override '#addToMyGame'(game: GameConstructor) {
		game.structures[this.id] = this as never;
	}
}

/**
 * Batch-compute the '#active' flag for all owned structures in a room. Groups structures
 * by type, sorts each group by distance to controller, and marks the closest ones active.
 * Called from the controller processor on room status changes, and lazily on first access.
 */
export function checkActiveStructures(room: Room) {
	const controller = room.controller;
	const level = controller?.level ?? 0;
	const userId = controller?.['#user'];
	const controllerStructures = C.CONTROLLER_STRUCTURES as Record<string, number[] | undefined>;
	// Single pass: collect owned structures by type
	const byType: Record<string, OwnedStructure[]> = {};
	for (const object of room['#objects']) {
		if (object instanceof OwnedStructure && object.structureType in controllerStructures) {
			(byType[object.structureType] ??= []).push(object);
		}
	}
	// Sort each group by distance to controller and mark active/inactive
	for (const [ type, structures ] of Object.entries(byType)) {
		const maxCount = controllerStructures[type]![level] ?? 0;
		if (maxCount === 0 || structures.length <= maxCount) {
			for (const structure of structures) {
				structure['#active'] = maxCount > 0 && structure['#user'] === userId;
			}
		} else {
			structures.sort(mappedNumericComparator(structure => structure.pos.getRangeTo(controller!.pos)));
			for (let ii = 0; ii < structures.length; ++ii) {
				structures[ii]['#active'] = ii < maxCount && structures[ii]['#user'] === userId;
			}
		}
	}
}

//
// Intent checks
export function checkBorder(pos: RoomPosition) {
	if (isBorder(pos.x, pos.y)) {
		// Cannot build obstacles on border
		return C.ERR_INVALID_TARGET;
	} else if (isNearBorder(pos.x, pos.y)) {
		// May build obstacles near "border" as long as the border is naturally walled
		const terrain = Game.map.getRoomTerrain(pos.roomName);
		for (const neighbor of iterateNeighbors(pos)) {
			if (
				isBorder(neighbor.x, neighbor.y) &&
				terrain.get(neighbor.x, neighbor.y) !== C.TERRAIN_MASK_WALL
			) {
				return C.ERR_INVALID_TARGET;
			}
		}
	}
	return C.OK;
}

export function checkWall(pos: RoomPosition) {
	if (Game.map.getRoomTerrain(pos.roomName).get(pos.x, pos.y) === C.TERRAIN_MASK_WALL) {
		return C.ERR_INVALID_TARGET;
	}
	return C.OK;
}

export function checkMyStructure(structure: Structure, constructor: abstract new(...args: any[]) => any) {
	if (!(structure instanceof constructor)) {
		return C.ERR_INVALID_ARGS;
	} else if (!structure.my) {
		return C.ERR_NOT_OWNER;
	}
	return C.OK;
}

export function checkIsActive(structure: Structure) {
	if (!structure.isActive()) {
		return C.ERR_RCL_NOT_ENOUGH;
	}
	return C.OK;
}

export function checkDestroy(structure: Structure) {
	return chainIntentChecks(
		() => structure instanceof Structure ? C.OK : C.ERR_INVALID_ARGS,
		() => structure.room.controller?.my ? C.OK : C.ERR_NOT_OWNER,
		() => {
			if ((structure.hits ?? 0) <= 0) {
				return C.ERR_INVALID_TARGET;
			} else if (structure.room.find(C.FIND_HOSTILE_CREEPS).length > 0) {
				return C.ERR_BUSY;
			}
		});
}

export function checkNotifyWhenAttacked(structure: Structure, notifyWhenAttacked: unknown) {
	if (structure.my === false || structure.room.controller?.my === false) {
		return C.ERR_NOT_OWNER;
	} else if (typeof notifyWhenAttacked !== 'boolean') {
		return C.ERR_INVALID_ARGS;
	}
	return C.OK;
}

export function checkPlacement(room: Room, pos: RoomPosition) {
	return chainIntentChecks(
		() => checkBorder(pos),
		() => checkWall(pos),
	);
}

export function lookForStructures<Type extends string>(room: Room, structureType: Type) {
	type Object = Extract<AnyStructure, { structureType: Type }>;
	return room.find(C.FIND_STRUCTURES).filter(
		(structure): structure is Object => structure.structureType === structureType);
}

export function lookForStructureAt<Type extends string>(room: Room, pos: RoomPosition, structureType: Type) {
	type Object = Extract<AnyStructure, { structureType: Type }>;
	return room.lookForAt(C.LOOK_STRUCTURES, pos).find(
		(structure): structure is Object => structure.structureType === structureType);
}

// Register pathfinding and movement rules
const destructibleStructureTypes = new Set(Object.keys(C.CONSTRUCTION_COST));
registerObstacleChecker(params => {
	if (params.ignoreDestructibleStructures) {
		return object => object instanceof Structure &&
			destructibleStructureTypes.has(object.structureType);
	} else {
		const { user } = params;
		return object => object instanceof Structure && object['#checkObstacle'](user);
	}
});

// Register `Game.structures`
declare module 'xxscreeps/game/game.js' {
	interface Game {
		structures: Record<string, AnyStructure>;
	}
}
hooks.register('gameInitializer', Game => Game.structures = Object.create(null));
