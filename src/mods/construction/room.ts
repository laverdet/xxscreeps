import type { ConstructibleStructureType, ConstructionSite } from './construction-site';
import * as C from 'xxscreeps/game/constants';
import * as Fn from 'xxscreeps/utility/functional';
import { intents, userGame } from 'xxscreeps/game';
import { chainIntentChecks } from 'xxscreeps/game/checks';
import { Room, registerFindHandlers, registerLook } from 'xxscreeps/game/room';
import { RoomPosition, fetchArguments } from 'xxscreeps/game/position';
import { extend } from 'xxscreeps/utility/utility';
import { structureFactories } from './symbols';

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
declare module 'xxscreeps/game/room/room' {
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
					if (userGame?.spawns[name]) {
						return C.ERR_INVALID_ARGS;
					}
				}
				return C.OK;
			},
			() => checkCreateConstructionSite(this, pos, structureType),
			() => intents.pushLocal(this, 'createConstructionSite', structureType, xx, yy, name));
	},
});

// Intent check
export function checkCreateConstructionSite(room: Room, pos: RoomPosition, structureType: ConstructibleStructureType) {
	// Check `structureType` is buildable
	if (!structureFactories.has(structureType)) {
		console.log(`TODO: create ${structureType}`);
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
		const existingCount = Fn.accumulate(Fn.concat(
			room.find(C.FIND_STRUCTURES),
			room.find(C.FIND_CONSTRUCTION_SITES),
		), object => object.structureType === structureType ? 1 : 0);
		if (existingCount >= C.CONTROLLER_STRUCTURES[structureType][rcl]) {
			// TODO: Check constructions sites made this tick too
			return C.ERR_RCL_NOT_ENOUGH;
		}
	}

	// checkPlacement hook
	if (structureFactories.get(structureType)?.checkPlacement(room, pos) === null) {
		return C.ERR_INVALID_TARGET;
	}

	// No structures on walls except for roads and extractors
	/*
	if (
		structureType !== 'extractor' && structureType !== 'road' &&
		terrain.get(pos.x, pos.y) === C.TERRAIN_MASK_WALL
	) {
		return C.ERR_INVALID_TARGET;
	}
	*/

	// No structures on top of others
	for (const object of Fn.concat(
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
