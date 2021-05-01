import type { AnyRoomObject, Room } from 'xxscreeps/game/room';
import type { GameConstructor } from 'xxscreeps/game';
import * as C from 'xxscreeps/game/constants';
import * as Id from 'xxscreeps/engine/schema/id';
import * as RoomObject from 'xxscreeps/game/object';
import * as RoomPosition from 'xxscreeps/game/position';
import { Game, intents, me, registerGameInitializer } from 'xxscreeps/game';
import { XSymbol, compose, declare, struct, withOverlay } from 'xxscreeps/schema';
import { registerObstacleChecker } from 'xxscreeps/game/path-finder';
import { chainIntentChecks, checkTarget } from 'xxscreeps/game/checks';

export type AnyStructure = Extract<AnyRoomObject, Structure>;
export const CheckObstacle = XSymbol('checkObstacle');

export const format = () => compose(shape, Structure);
const shape = declare('Structure', struct(RoomObject.format, {
	hits: 'int32',
	[RoomObject.Owner]: Id.optionalFormat,
}));

export abstract class Structure extends withOverlay(RoomObject.RoomObject, shape) {
	abstract get structureType(): string;
	get hitsMax() { return this.hits }
	get my() { return this.owner === null ? undefined : this.owner === me }
	get owner() { return this[RoomObject.Owner] }
	get [RoomObject.LookType]() { return C.LOOK_STRUCTURES }

	/**
	 * Destroy this structure immediately.
	 */
	destroy(this: Structure) {
		return chainIntentChecks(
			() => checkDestroy(this),
			() => intents.save(this, 'destroyStructure'));
	}

	[CheckObstacle](_user: string) {
		return true;
	}

	[RoomObject.AddToMyGame](game: GameConstructor) {
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

export function checkDestroy(structure: Structure) {
	return chainIntentChecks(
		() => checkTarget(structure, Structure),
		() => {
			if (!structure.my && !structure.room.controller?.my) {
				return C.ERR_NOT_OWNER;
			} else if (structure.room.find(C.FIND_HOSTILE_CREEPS).length > 0) {
				return C.ERR_BUSY;
			}
			return C.OK;
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
		return object => object instanceof Structure && object[CheckObstacle](user);
	}
});

// Register `Game.structures`
declare module 'xxscreeps/game/game' {
	interface Game {
		structures: Record<string, AnyStructure>;
	}
}
registerGameInitializer(Game => Game.structures = Object.create(null));
