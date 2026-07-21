import type { ProcessorContext } from 'xxscreeps/engine/processor/room.js';
import type { GameConstructor } from 'xxscreeps/game/index.js';
import type { RoomPosition } from 'xxscreeps/game/position.js';
import type { AnyRoomObject, Room } from 'xxscreeps/game/room/index.js';
import { mappedNumericComparator } from 'xxscreeps/functional/comparator.js';
import { chainIntentChecks } from 'xxscreeps/game/checks.js';
import * as C from 'xxscreeps/game/constants/index.js';
import { Game, intents, me, userInfo } from 'xxscreeps/game/index.js';
import { RoomObject } from 'xxscreeps/game/object.js';
import { registerObstacleChecker } from 'xxscreeps/game/pathfinder/index.js';
import { isBorder, isNearBorder, iterateNeighbors } from 'xxscreeps/game/position.js';
import { appendEventLog } from 'xxscreeps/game/room/event-log.js';
import { withOverlay } from 'xxscreeps/schema/index.js';
import { createRuin } from './ruin.js';
import { ownedStructureShape, structureShape } from './schema.js';

export type AnyStructure = Extract<AnyRoomObject, Structure>;

export interface DestructibleStructure extends Structure {
	hits: number;
	hitsMax: number;
}

/**
 * The base prototype object of all structures.
 * @public
 * @see https://docs.screeps.com/api/#Structure
 */
export class Structure extends withOverlay(RoomObject, structureShape) {

	/**
	 * One of the `STRUCTURE_*` constants.
	 * @public
	 * @see https://docs.screeps.com/api/#Structure.structureType
	 */
	@enumerable get structureType(): string { throw new Error(); }

	/**
	 * The current amount of hit points of the structure.
	 * @public
	 * @see https://docs.screeps.com/api/#Structure.hits
	 */
	@enumerable override get hits(): number | undefined { return undefined; }

	/**
	 * The total amount of hit points of the structure.
	 * @public
	 * @see https://docs.screeps.com/api/#Structure.hitsMax
	 */
	@enumerable override get hitsMax(): number | undefined { return undefined; }

	override get '#layer'() { return 0; }
	get '#lookType'() { return C.LOOK_STRUCTURES; }

	override set hits(_hits: number | undefined) { throw new Error('Adjusting hits on invulnerable structure'); }

	/**
	 * Destroy this structure immediately.
	 * @returns One of the following codes: `OK`, `ERR_NOT_OWNER`, `ERR_BUSY`
	 * @public
	 * @see https://docs.screeps.com/api/#Structure.destroy
	 */
	destroy(this: Structure) {
		return chainIntentChecks(
			() => checkDestroy(this),
			() => intents.save(this, 'destroyStructure'));
	}

	/**
	 * Check whether this structure can be used. If room controller level is insufficient, then this
	 * method will return false, and the structure will be highlighted with red in the game.
	 * @returns A boolean value.
	 * @public
	 * @see https://docs.screeps.com/api/#Structure.isActive
	 */
	isActive(): boolean {
		return true;
	}

	'#checkObstacle'(_user: string) {
		return true;
	}

	'#doesPreventInteraction'(_user: string) {
		return false;
	}

	override '#destroy'(type?: number) {
		if (super['#destroy']()) {
			// TODO: Mod concern leak
			if (type === undefined || type !== C.EVENT_ATTACK_TYPE_NUKE) {
				this.room['#insertObject'](createRuin(this));
			}
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
 * @public
 * @see https://docs.screeps.com/api/#OwnedStructure
 */
export class OwnedStructure extends withOverlay(Structure, ownedStructureShape) {
	/**
	 * A {@link UserInfo} object with the structure's owner info.
	 * @public
	 * @see https://docs.screeps.com/api/#OwnedStructure.owner
	 */
	@enumerable get owner() { return userInfo.get(this['#user']!); }

	/**
	 * Whether this is your own structure.
	 * @public
	 * @see https://docs.screeps.com/api/#OwnedStructure.my
	 */
	@enumerable override get my() {
		const user = this['#user'];
		return user === null ? undefined : user === me;
	}

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

	override '#destroy'(type?: number) {
		if (super['#destroy'](type)) {
			// Invalidate active flags for same-type structures so the lazy
			// fallback in isActive() recomputes after this structure is flushed
			const structureType = this.structureType;
			for (const object of this.room['#objects']) {
				if (object instanceof OwnedStructure && object.structureType === structureType) {
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

	'#sendAttackNotify'(_context: ProcessorContext, _source: RoomObject | undefined) {}
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
	// Single pass: collect the controller owner's structures by type; other users' structures
	// never rank against the cap
	const byType: Record<string, OwnedStructure[]> = {};
	for (const object of room['#immediateObjects']()) {
		if (object instanceof OwnedStructure && object.structureType in controllerStructures) {
			if (object['#user'] === null) {
				// Owner-less structures are always active and count against no one's quota
				object['#active'] = true;
			} else if (object['#user'] === userId) {
				(byType[object.structureType] ??= []).push(object);
			} else {
				object['#active'] = false;
			}
		}
	}
	// Sort each group by distance to controller and mark active/inactive
	for (const [ type, structures ] of Object.entries(byType)) {
		const maxCount = controllerStructures[type]![level] ?? 0;
		if (maxCount === 0 || structures.length <= maxCount) {
			for (const structure of structures) {
				structure['#active'] = maxCount > 0;
			}
		} else {
			structures.sort(mappedNumericComparator(structure => structure.pos.getRangeTo(controller!.pos)));
			for (const [ ii, structure ] of structures.entries()) {
				structure['#active'] = ii < maxCount;
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

export function checkPlacement(room: Room, pos: RoomPosition) {
	return chainIntentChecks(
		() => checkBorder(pos),
		() => checkWall(pos),
	);
}

export function lookForStructures<Type extends string>(room: Room | undefined, structureType: Type) {
	type Object = Extract<AnyStructure, { structureType: Type }>;
	if (room) {
		return room.find(C.FIND_STRUCTURES).filter(
			(structure): structure is Object => structure.structureType === structureType);
	} else {
		return [];
	}
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
