import * as C from 'xxscreeps/game/constants';
import * as Game from 'xxscreeps/game/game';
import { chainIntentChecks } from 'xxscreeps/game/checks';
import { Room, lookFor, registerLook, registerFindHandlers } from 'xxscreeps/game/room';
import { RoomPosition, fetchArguments, iterateNeighbors } from 'xxscreeps/game/position';
import { isBorder, isNearBorder } from 'xxscreeps/game/terrain';
import { accumulate, concatInPlace, extend } from 'xxscreeps/util/utility';
import { ConstructibleStructureType, ConstructionSite } from './construction-site';
import { structureFactories } from './symbols';

// Register FIND_ types for `ConstructionSite`
const find = registerFindHandlers({
	[C.FIND_CONSTRUCTION_SITES]: room =>
		lookFor(room, C.LOOK_CONSTRUCTION_SITES),
	[C.FIND_MY_CONSTRUCTION_SITES]: room =>
		lookFor(room, C.LOOK_CONSTRUCTION_SITES).filter(constructionSite => constructionSite.my),
	[C.FIND_HOSTILE_CONSTRUCTION_SITES]: room =>
		lookFor(room, C.LOOK_CONSTRUCTION_SITES).filter(constructionSite => !constructionSite.my),
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
		const [ structureType, name ] = rest;

		// Send it off
		return chainIntentChecks(
			() => {
				if (structureType === 'spawn' && typeof name === 'string') {
					// TODO: Check newly created spawns too
					// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
					if (Game.spawns[name]) {
						return C.ERR_INVALID_ARGS;
					}
				}
				return C.OK;
			},
			() => checkCreateConstructionSite(this, pos, structureType),
			() => Game.intents.push(this, 'createConstructionSite', structureType, xx, yy, name));
	},
});

// Intent check
export function checkCreateConstructionSite(room: Room, pos: RoomPosition, structureType: ConstructibleStructureType) {
	// Check `structureType` is buildable
	if (!structureFactories.has(structureType)) {
		return C.ERR_INVALID_ARGS;
	}

	// Can't build in someone else's room
	if (room.controller) {
		if (room.controller.owner !== null && !room.controller.my) {
			return C.ERR_RCL_NOT_ENOUGH;
		}
	}

	// Check structure count for this RCL
	const rcl = room.controller?.level ?? 0;
	if (rcl === 0 && structureType === 'spawn') {
		// TODO: GCL check here
		if (!room.controller) {
			return C.ERR_RCL_NOT_ENOUGH;
		}
	} else {
		const existingCount = accumulate(concatInPlace(
			room.find(C.FIND_STRUCTURES),
			room.find(C.FIND_CONSTRUCTION_SITES),
		), object => object.structureType === structureType ? 1 : 0);
		if (existingCount >= C.CONTROLLER_STRUCTURES[structureType][rcl]) {
			// TODO: Check constructions sites made this tick too
			return C.ERR_RCL_NOT_ENOUGH;
		}
	}

	// No structures on borders
	if (isNearBorder(pos.x, pos.y)) {
		return C.ERR_INVALID_TARGET;
	}

	// No structures next to borders unless it's against a wall, or it's a road/container
	const terrain = room.getTerrain();
	if (structureType !== 'road' && structureType !== 'container' && isNearBorder(pos.x, pos.y)) {
		for (const neighbor of iterateNeighbors(pos)) {
			if (
				isBorder(neighbor.x, neighbor.y) &&
				terrain.get(neighbor.x, neighbor.y) !== C.TERRAIN_MASK_WALL
			) {
				return C.ERR_INVALID_TARGET;
			}
		}
	}

	// No structures on walls except for roads and extractors
	if (
		structureType !== 'extractor' && structureType !== 'road' &&
		terrain.get(pos.x, pos.y) === C.TERRAIN_MASK_WALL
	) {
		return C.ERR_INVALID_TARGET;
	}

	// No structures on top of others
	for (const object of concatInPlace(
		room.find(C.FIND_CONSTRUCTION_SITES),
		room.find(C.FIND_STRUCTURES),
	)) {
		if (
			object.pos.isEqualTo(pos) &&
			(object.structureType === structureType ||
				(structureType !== 'rampart' && structureType !== 'road' &&
				object.structureType !== 'rampart' && object.structureType !== 'road'))
		) {
			return C.ERR_INVALID_TARGET;
		}
	}

	// TODO: Extractors must be built on mineral
	// TODO: Limit total construction sites built

	return C.OK;
}
