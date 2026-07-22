import type { RoomPosition } from 'xxscreeps/game/position.js';
import { chainIntentChecks } from 'xxscreeps/game/checks.js';
import { Game, intents } from 'xxscreeps/game/index.js';
import { createRoomObject } from 'xxscreeps/game/object.js';
import { registerBuildableStructure } from 'xxscreeps/mods/classic/construction/game.js';
import { OwnedStructure, checkIsActive, checkMyStructure, checkPlacement } from 'xxscreeps/mods/classic/structure/structure.js';
import { withOverlay } from 'xxscreeps/schema/index.js';
import { assign } from 'xxscreeps/utility/utility.js';
import * as C from 'xxscreeps:mods/constants';
import { observerShape } from './schema.js';

/**
 * Provides visibility into a distant room from your script.
 * @public
 * @see https://docs.screeps.com/api/#StructureObserver
 */
export class StructureObserver extends withOverlay(OwnedStructure, observerShape) {
	/**
	 * The total amount of hit points of the structure.
	 * @public
	 * @see https://docs.screeps.com/api/#StructureObserver.hitsMax
	 */
	override get hitsMax() { return C.OBSERVER_HITS; }

	/**
	 * One of the `STRUCTURE_*` constants.
	 * @public
	 * @see https://docs.screeps.com/api/#StructureObserver.structureType
	 */
	override get structureType() { return C.STRUCTURE_OBSERVER; }

	/**
	 * Provide visibility into a distant room from your script. The target room object will be
	 * available on the next tick.
	 * @param roomName The name of the target room.
	 * @returns One of the following codes: `OK`, `ERR_NOT_OWNER`, `ERR_INVALID_ARGS`,
	 * `ERR_NOT_IN_RANGE`, `ERR_RCL_NOT_ENOUGH`
	 * @public
	 * @see https://docs.screeps.com/api/#StructureObserver.observeRoom
	 */
	observeRoom(roomName: string) {
		return chainIntentChecks(
			() => checkObserveRoom(this, roomName),
			() => intents.save(this, 'observeRoom', roomName));
	}
}

export function create(pos: RoomPosition, owner: string) {
	const observer = assign(createRoomObject(new StructureObserver(), pos), {
		hits: C.OBSERVER_HITS,
	});
	observer['#user'] = owner;
	return observer;
}

// `ConstructionSite` registration
registerBuildableStructure(C.STRUCTURE_OBSERVER, {
	obstacle: true,
	checkPlacement(room, pos) {
		return checkPlacement(room, pos) === C.OK
			? C.CONSTRUCTION_COST.observer : null;
	},
	create(site) {
		return create(site.pos, site['#user']);
	},
});

//
// Intent checks
function checkObserveRoomName(target: string) {
	return Game.map.getRoomStatus(target, true) ? C.OK : C.ERR_INVALID_ARGS;
}

function checkObserveRoomRange(observer: StructureObserver, target: string) {
	if (Game.map.getRoomLinearDistance(observer.room.name, target) <= C.OBSERVER_RANGE) {
		return C.OK;
	} else {
		return C.ERR_NOT_IN_RANGE;
	}
}

export function checkObserveRoom(observer: StructureObserver, target: string) {
	return chainIntentChecks(
		() => checkMyStructure(observer, StructureObserver),
		() => checkObserveRoomName(target),
		() => checkIsActive(observer),
		() => checkObserveRoomRange(observer, target),
	);
}
