import { Fn } from 'xxscreeps/functional/fn.js';
import { chainIntentChecks } from 'xxscreeps/game/checks.js';
import * as C from 'xxscreeps/game/constants/index.js';
import { hooks, intents, me, userGame } from 'xxscreeps/game/index.js';
import { makeObstacleChecker } from 'xxscreeps/game/pathfinder/obstacle.js';
import { RoomPosition, fetchArguments } from 'xxscreeps/game/position.js';
import { Room, registerFindHandlers, registerLook } from 'xxscreeps/game/room/index.js';
import { Structure } from 'xxscreeps/mods/structure/structure.js';
import { asUnion, extend } from 'xxscreeps/utility/utility.js';
import { ConstructibleStructureType, ConstructionSite } from './construction-site.js';
import { structureFactories } from './symbols.js';

// Register FIND_ types for `ConstructionSite`
const find = registerFindHandlers({
	[C.FIND_CONSTRUCTION_SITES]: room =>
		room['#lookFor'](C.LOOK_CONSTRUCTION_SITES),
	[C.FIND_MY_CONSTRUCTION_SITES]: room =>
		room['#lookFor'](C.LOOK_CONSTRUCTION_SITES).filter(constructionSite => constructionSite.my),
	[C.FIND_HOSTILE_CONSTRUCTION_SITES]: room =>
		room['#lookFor'](C.LOOK_CONSTRUCTION_SITES).filter(constructionSite => !constructionSite.my),
});

// Register LOOK_ type for `ConstructionSite`
const look = registerLook<ConstructionSite>()(C.LOOK_CONSTRUCTION_SITES);
declare module 'xxscreeps/game/room/index.js' {
	interface Find { construction: typeof find }
	interface Look { construction: typeof look }
}

// Extend `Room`
declare module 'xxscreeps/game/room/index.js' {
	interface Room {
		/**
		 * Create new `ConstructionSite` at the specified location.
		 * @param structureType One of the `STRUCTURE_*` constants.
		 * @param name The name of the structure, for structures that support it (currently only spawns).
		 */
		createConstructionSite(x: number, y: number, structureType: ConstructibleStructureType, name?: string): number;
		createConstructionSite(pos: RoomPosition, structureType: ConstructibleStructureType, name?: string): number;
	}
}

const createdNames = new Set<string>();
// Mirrors vanilla's `createdConstructionSites` runtime counter. The processor runs per-room and
// cannot enforce this shard-level constraint, so it is only checked here in the player runtime.
let createdConstructionSites = 0;
hooks.register('gameInitializer', () => {
	createdNames.clear();
	createdConstructionSites = 0;
});

extend(Room, {
	createConstructionSite(this: Room, ...args: any[]) {

		// Extract overloaded parameters
		const { xx, yy, rest } = fetchArguments(...args);
		if (args[0] instanceof RoomPosition && args[0].roomName !== this.name) {
			return C.ERR_INVALID_ARGS;
		}
		const pos = new RoomPosition(xx, yy, this.name);
		const [ structureType, nameArg ] = rest;
		const name = structureFactories.get(structureType)?.checkName?.(this, nameArg);
		if (name) {
			if (createdNames.has(name)) {
				return C.ERR_NAME_EXISTS;
			}
			createdNames.add(name);
		}

		// Check global construction site limit
		if (userGame && Object.keys(userGame.constructionSites).length + createdConstructionSites >= C.MAX_CONSTRUCTION_SITES) {
			return C.ERR_FULL;
		}

		// Send it off
		const result = chainIntentChecks(
			() => checkCreateConstructionSite(this, pos, structureType, name),
			() => intents.pushLocal(this, 'createConstructionSite', structureType, xx, yy, name));
		if (result === C.OK) {
			++createdConstructionSites;
		}
		return result;
	},
});

// Intent check
export function checkCreateConstructionSite(room: Room, pos: RoomPosition, structureType: ConstructibleStructureType, name: string | null | undefined) {
	// Check `structureType` is buildable
	const factory = structureFactories.get(structureType);
	if (!factory) {
		console.log(`TODO: create ${structureType}`);
		return C.ERR_INVALID_ARGS;
	}

	// Can't build in someone else's room
	if (room.controller?.my === false) {
		return C.ERR_RCL_NOT_ENOUGH;
	}

	// Check structure count for this RCL
	const existingCount = Fn.accumulate(Fn.concat<Structure | ConstructionSite>([
		room['#lookFor'](C.LOOK_STRUCTURES),
		room['#lookFor'](C.LOOK_CONSTRUCTION_SITES),
	]), object => object.structureType === structureType ? 1 : 0);
	if (existingCount >= C.CONTROLLER_STRUCTURES[structureType][room.controller?.level ?? 0]) {
		return C.ERR_RCL_NOT_ENOUGH;
	}

	// checkPlacement hook
	if (factory.checkPlacement(room, pos) === null) {
		return C.ERR_INVALID_TARGET;
	} else if (factory.checkName?.(room, name) === null) {
		return C.ERR_INVALID_ARGS;
	}

	// No structures on top of others
	const { obstacle } = factory;
	const obstacleChecker = makeObstacleChecker({
		checkTerrain: false,
		ignoreCreeps: true,
		room,
		user: me,
	});
	for (const object of room['#lookAt'](pos)) {
		asUnion(object);
		if (
			object['#lookType'] === C.LOOK_CONSTRUCTION_SITES ||
			object.structureType === structureType ||
			(obstacle && obstacleChecker(object))
		) {
			return C.ERR_INVALID_TARGET;
		}
	}

	return C.OK;
}
