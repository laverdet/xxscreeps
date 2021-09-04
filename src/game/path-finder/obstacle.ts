import type { Room } from 'xxscreeps/game/room';
import type { RoomObject } from 'xxscreeps/game/object';
import type { RoomPosition } from 'xxscreeps/game/position';
import * as C from 'xxscreeps/game/constants';

type MovementParameters = {
	checkTerrain?: boolean | undefined;
	ignoreCreeps?: boolean | undefined;
	ignoreDestructibleStructures?: boolean | undefined;
	room: Room;
	user: string;
};

type ObstacleChecker = (params: MovementParameters) =>
	((object: RoomObject) => boolean) | null;

const obstacleCheckers: ObstacleChecker[] = [];
export function registerObstacleChecker(fn: ObstacleChecker) {
	obstacleCheckers.push(fn);
}

/**
 * Creates an obstacle checker based on the parameters. The return value of the callback will be
 * `true` if the object is an obstacle.
 */
export function makeObstacleChecker(params: MovementParameters) {
	return obstacleCheckers.reduce((fn, factory) => {
		const next = factory(params);
		if (next) {
			return (object: RoomObject) => fn(object) || next(object);
		}
		return fn;
	}, (_object: RoomObject) => false);
}

/**
 * Creates a position checker. The return value of the callback will be `true` if the position is
 * not obstructed.
 */
export function makePositionChecker(params: MovementParameters) {
	const { room } = params;
	const checkObstacle = makeObstacleChecker(params);
	const check = (pos: RoomPosition) => !room['#lookAt'](pos).some(object => checkObstacle(object));
	if (params.checkTerrain) {
		const terrain = room.getTerrain();
		return (pos: RoomPosition) => terrain.get(pos.x, pos.y) !== C.TERRAIN_MASK_WALL && check(pos);
	}
	return check;
}

/*
	type Filter = (object: RoomObject) => boolean;
	const { controller } = room;
	const { pathing } = options;
	const creepFilter = function(): Filter {
		if (options.ignoreCreeps) {
			return () => false;
		} else if (controller?.safeMode === undefined) {
			return object => object instanceof Creep;
		} else {
			const safeUser = controller.owner;
			return object => object instanceof Creep && (object.owner === safeUser || user !== safeUser);
		}
	}();
	const structureFilter = function(): Filter {
		if (options.ignoreDestructibleStructures) {
			return object => object instanceof Structure && !destructibleStructureTypes.has(object.structureType);
		} else {
			return object => object instanceof Structure && (
				obstacleTypes.has(object.structureType) ||
				(pathing === true && object.structureType === 'portal'));
		}
	}();
	const constructionSiteFilter = function(): Filter {
		if (pathing) {
			return object => object instanceof ConstructionSite &&
				object.owner === user && obstacleTypes.has(object.structureType);
		} else {
			return () => false;
		}
	}();
	return (object: RoomObject) =>
		creepFilter(object) || structureFilter(object) || constructionSiteFilter(object) ||
		permanentObstacleTypes.has(object[Variant as never]);
}

// Exported Game namespace
export default { CostMatrix, search, use };
*/
