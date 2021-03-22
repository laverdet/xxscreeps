import type { AnyRoomObject, Room } from 'xxscreeps/game/room';
import * as C from 'xxscreeps/game/constants';
import * as Game from 'xxscreeps/game';
import * as Id from 'xxscreeps/engine/schema/id';
import * as RoomObject from 'xxscreeps/game/object';
import * as RoomPosition from 'xxscreeps/game/position';
import * as Map from 'xxscreeps/game/map';
import { compose, declare, struct, withOverlay, XSymbol } from 'xxscreeps/schema';
import { registerObstacleChecker } from 'xxscreeps/game/path-finder';
import { chainIntentChecks } from 'xxscreeps/game/checks';

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
	get my() { return this.owner === null ? undefined : this.owner === Game.me }
	get owner() { return this[RoomObject.Owner] }
	get [RoomObject.LookType]() { return C.LOOK_STRUCTURES }

	[CheckObstacle](_user: string) {
		return true;
	}

	[RoomObject.AddToMyGame](game: Game.Game) {
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
		const terrain = Map.getTerrainForRoom(pos.roomName);
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
	if (Map.getTerrainForRoom(pos.roomName).get(pos.x, pos.y) === C.TERRAIN_MASK_WALL) {
		return C.ERR_INVALID_TARGET;
	}
	return C.OK;
}

export function checkPlacement(room: Room, pos: RoomPosition.RoomPosition) {
	return chainIntentChecks(
		() => checkBorder(pos),
		() => checkWall(pos),
	);
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
declare module 'xxscreeps/game' {
	interface Game {
		structures: Record<string, AnyStructure>;
	}
}
Game.registerGameInitializer(game => game.structures = Object.create(null));
