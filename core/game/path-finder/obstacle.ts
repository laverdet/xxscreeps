import type { RoomObject } from '../object';
import type { Room } from '../room';

type MovementParameters = {
	ignoreCreeps?: boolean;
	ignoreDestructibleStructures?: boolean;
	isPathFinder: boolean;
	room: Room;
	type: string;
	user: string;
};

type ObstacleChecker = (params: MovementParameters) =>
	((object: RoomObject) => boolean) | null;

const obstacleCheckers: ObstacleChecker[] = [];
export function registerObstacleChecker(fn: ObstacleChecker) {
	obstacleCheckers.push(fn);
}

export function makeObstacleChecker(params: MovementParameters) {
	return obstacleCheckers.reduce((fn, factory) => {
		const next = factory(params);
		if (next) {
			return (object: RoomObject) => fn(object) || next(object);
		}
		return fn;
	}, (_object: RoomObject) => false);
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
