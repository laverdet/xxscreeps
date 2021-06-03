import type { AnyRoomObject, Room } from 'xxscreeps/game/room';
import type { GameConstructor } from 'xxscreeps/game';
import * as C from 'xxscreeps/game/constants';
import * as Id from 'xxscreeps/engine/schema/id';
import * as RoomObject from 'xxscreeps/game/object';
import * as RoomPosition from 'xxscreeps/game/position';
import { Game, intents, me, registerGameInitializer, userInfo } from 'xxscreeps/game';
import { compose, declare, struct, withOverlay } from 'xxscreeps/schema';
import { registerObstacleChecker } from 'xxscreeps/game/path-finder';
import { chainIntentChecks } from 'xxscreeps/game/checks';

export type AnyStructure = Extract<AnyRoomObject, Structure>;

export interface DestructibleStructure extends Structure {
	hits: number;
	hitsMax: number;
}

export const structureFormat = declare('Structure', () => compose(shape, Structure));
const shape = RoomObject.format;

export const ownedStructureFormat = declare('OwnedStructure', () => compose(ownedShape, OwnedStructure));
const ownedShape = struct(structureFormat, {
	'#user': Id.optionalFormat,
});

/**
 * The base prototype object of all structures.
 */
export abstract class Structure extends withOverlay(RoomObject.RoomObject, shape) {
	abstract get structureType(): string;
	get ['#lookType']() { return C.LOOK_STRUCTURES }

	get hits(): number | undefined { return undefined }
	set hits(hits: number | undefined) { throw new Error('Adjusting hits on invulnerable structure') }
	get hitsMax(): number | undefined { return undefined }

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
	isActive() {
		return true;
	}

	['#checkObstacle'](_user: string) {
		return true;
	}
}

/**
 * The base prototype for a structure that has an owner. Such structures can be found using
 * `FIND_MY_STRUCTURES` and `FIND_HOSTILE_STRUCTURES` constants.
 */
export abstract class OwnedStructure extends withOverlay(Structure, ownedShape) {
	override get ['#hasIntent']() { return true }
	override get ['#providesVision']() { return true }
	get owner() { return userInfo.get(this['#user']!) }

	override get my() {
		const user = this['#user'];
		return user === null ? undefined : user === me;
	}

	override ['#addToMyGame'](game: GameConstructor) {
		game.structures[this.id] = this as never;
	}
}

//
// Intent checks
export function checkBorder(pos: RoomPosition.RoomPosition) {
	if (RoomPosition.isBorder(pos.x, pos.y)) {
		// Cannot build obstacles on border
		return C.ERR_INVALID_TARGET;
	} else if (RoomPosition.isNearBorder(pos.x, pos.y)) {
		// May build obstacles near "border" as long as the border is naturally walled
		const terrain = Game.map.getRoomTerrain(pos.roomName);
		for (const neighbor of RoomPosition.iterateNeighbors(pos)) {
			if (
				RoomPosition.isBorder(neighbor.x, neighbor.y) &&
				terrain.get(neighbor.x, neighbor.y) === C.TERRAIN_MASK_WALL
			) {
				return C.ERR_INVALID_TARGET;
			}
		}
	}
	return C.OK;
}

export function checkWall(pos: RoomPosition.RoomPosition) {
	if (Game.map.getRoomTerrain(pos.roomName).get(pos.x, pos.y) === C.TERRAIN_MASK_WALL) {
		return C.ERR_INVALID_TARGET;
	}
	return C.OK;
}

export function checkMyStructure(structure: Structure, constructor: abstract new(...args: any[]) => any) {
	if (!(structure instanceof constructor)) {
		return C.ERR_INVALID_ARGS;
	} else if (!structure.my && !structure.room.controller?.my) {
		return C.ERR_NOT_OWNER;
	}
	return C.OK;
}

export function checkDestroy(structure: Structure) {
	return chainIntentChecks(
		() => checkMyStructure(structure, Structure),
		() => {
			if (structure.room.find(C.FIND_HOSTILE_CREEPS).length > 0) {
				return C.ERR_BUSY;
			}
		});
}

export function checkPlacement(room: Room, pos: RoomPosition.RoomPosition) {
	return chainIntentChecks(
		() => checkBorder(pos),
		() => checkWall(pos),
	);
}

export function lookForStructureAt<Type extends string>(room: Room, pos: RoomPosition.RoomPosition, structureType: Type) {
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
declare module 'xxscreeps/game/game' {
	interface Game {
		structures: Record<string, AnyStructure>;
	}
}
registerGameInitializer(Game => Game.structures = Object.create(null));
