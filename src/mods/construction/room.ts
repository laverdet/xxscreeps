import type { ConstructibleStructureType, ConstructionSite } from './construction-site';
import * as C from 'xxscreeps/game/constants';
import * as Fn from 'xxscreeps/utility/functional';
import { intents, me } from 'xxscreeps/game';
import { chainIntentChecks } from 'xxscreeps/game/checks';
import { Room, registerFindHandlers, registerLook } from 'xxscreeps/game/room';
import { RoomPosition, fetchArguments } from 'xxscreeps/game/position';
import { asUnion, extend } from 'xxscreeps/utility/utility';
import { structureFactories } from './symbols';
import { makeObstacleChecker } from 'xxscreeps/game/path-finder/obstacle';

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
declare module 'xxscreeps/game/room' {
	interface Find { construction: typeof find }
	interface Look { construction: typeof look }
}

// Extend `Room`
declare module 'xxscreeps/game/room' {
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

		// Send it off
		return chainIntentChecks(
			() => checkCreateConstructionSite(this, pos, structureType, name),
			() => intents.pushLocal(this, 'createConstructionSite', structureType, xx, yy, name));
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
	const existingCount = Fn.accumulate(Fn.concat(
		room['#lookFor'](C.LOOK_STRUCTURES),
		room['#lookFor'](C.LOOK_CONSTRUCTION_SITES),
	), object => object.structureType === structureType ? 1 : 0);
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
			object.structureType === structureType ||
			(obstacle && obstacleChecker(object))
		) {
			return C.ERR_INVALID_TARGET;
		}
	}

	return C.OK;
}
