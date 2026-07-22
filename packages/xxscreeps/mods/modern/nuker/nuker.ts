import { chainIntentChecks } from 'xxscreeps/game/checks.js';
import { Game, intents } from 'xxscreeps/game/index.js';
import { createRoomObject } from 'xxscreeps/game/object.js';
import { RoomPosition } from 'xxscreeps/game/position.js';
import { registerBuildableStructure } from 'xxscreeps/mods/classic/construction/game.js';
import { OwnedStructure, checkIsActive, checkMyStructure, checkPlacement } from 'xxscreeps/mods/classic/structure/structure.js';
import { withOverlay } from 'xxscreeps/schema/index.js';
import { assign } from 'xxscreeps/utility/utility.js';
import * as C from 'xxscreeps:mods/constants';
import { nukerShape } from './schema.js';
import { NukerStore } from './store.js';

/**
 * Launches a nuke to another room dealing huge damage to the landing area. Each launch has a
 * cooldown and requires energy and ghodium resources. Launching creates a
 * [Nuke](https://docs.screeps.com/api/#Nuke) object at the target room position which is visible to
 * any player until it is landed. Incoming nuke cannot be moved or cancelled. Nukes cannot be
 * launched from or to novice rooms. Resources placed into a StructureNuker cannot be withdrawn.
 * @public
 * @see https://docs.screeps.com/api/#StructureNuker
 */
export class StructureNuker extends withOverlay(OwnedStructure, nukerShape) {
	/**
	 * The amount of game ticks until the next launch is possible.
	 * @public
	 * @see https://docs.screeps.com/api/#StructureNuker.cooldown
	 */
	@enumerable get cooldown() { return Math.max(0, this['#cooldownTime'] - Game.time); }

	/**
	 * An alias for `.store[RESOURCE_ENERGY]`.
	 * @public
	 * @deprecated
	 * @see https://docs.screeps.com/api/#StructureNuker.energy
	 */
	@enumerable get energy() { return this.store[C.RESOURCE_ENERGY]; }

	/**
	 * An alias for `.store.getCapacity(RESOURCE_ENERGY)`.
	 * @public
	 * @deprecated
	 * @see https://docs.screeps.com/api/#StructureNuker.energyCapacity
	 */
	@enumerable get energyCapacity() { return this.store.getCapacity(C.RESOURCE_ENERGY) ?? 0; }

	/**
	 * An alias for `.store[RESOURCE_GHODIUM]`.
	 * @public
	 * @deprecated
	 * @see https://docs.screeps.com/api/#StructureNuker.ghodium
	 */
	@enumerable get ghodium() { return this.store[C.RESOURCE_GHODIUM]; }

	/**
	 * An alias for `.store.getCapacity(RESOURCE_GHODIUM)`.
	 * @public
	 * @deprecated
	 * @see https://docs.screeps.com/api/#StructureNuker.ghodiumCapacity
	 */
	@enumerable get ghodiumCapacity() { return this.store.getCapacity(C.RESOURCE_GHODIUM) ?? 0; }

	/**
	 * The total amount of hit points of the structure.
	 * @public
	 * @see https://docs.screeps.com/api/#StructureNuker.hitsMax
	 */
	override get hitsMax() { return C.NUKER_HITS; }

	/**
	 * One of the `STRUCTURE_*` constants.
	 * @public
	 * @see https://docs.screeps.com/api/#StructureNuker.structureType
	 */
	override get structureType() { return C.STRUCTURE_NUKER; }

	/**
	 * Launch a nuke to the specified position. The target must be at most `NUKE_RANGE` rooms away
	 * (Chebyshev distance). Consumes the nuker's full store and starts a `NUKER_COOLDOWN` cooldown.
	 * @param target The target room position.
	 * @returns One of the following codes: `OK`, `ERR_NOT_OWNER`, `ERR_NOT_ENOUGH_RESOURCES`,
	 * `ERR_INVALID_ARGS`, `ERR_INVALID_TARGET`, `ERR_NOT_IN_RANGE`, `ERR_TIRED`, `ERR_RCL_NOT_ENOUGH`
	 * @public
	 * @see https://docs.screeps.com/api/#StructureNuker.launchNuke
	 */
	launchNuke(target: RoomPosition) {
		return chainIntentChecks(
			() => checkLaunchNuke(this, target),
			() => intents.save(this, 'launchNuke', target['#id']));
	}
}

export function create(pos: RoomPosition, owner: string) {
	const nuker = assign(createRoomObject(new StructureNuker(), pos), {
		hits: C.NUKER_HITS,
		store: new NukerStore(),
	});
	nuker['#user'] = owner;
	return nuker;
}

registerBuildableStructure(C.STRUCTURE_NUKER, {
	obstacle: true,
	checkPlacement(room, pos) {
		return checkPlacement(room, pos) === C.OK
			? C.CONSTRUCTION_COST.nuker : null;
	},
	create(site) {
		return create(site.pos, site['#user']);
	},
});

function checkLaunchTarget(target: RoomPosition) {
	if (!(target instanceof RoomPosition)) {
		return C.ERR_INVALID_ARGS;
	}
	return C.OK;
}

function checkLaunchCooldown(nuker: StructureNuker) {
	if (nuker.cooldown > 0) {
		return C.ERR_TIRED;
	}
	return C.OK;
}

function checkLaunchRange(nuker: StructureNuker, target: RoomPosition) {
	if (Game.map.getRoomLinearDistance(nuker.room.name, target.roomName) > C.NUKE_RANGE) {
		return C.ERR_NOT_IN_RANGE;
	}
	return C.OK;
}

function checkLaunchResources(nuker: StructureNuker) {
	if (
		nuker.store[C.RESOURCE_ENERGY] < C.NUKER_ENERGY_CAPACITY ||
		nuker.store[C.RESOURCE_GHODIUM] < C.NUKER_GHODIUM_CAPACITY
	) {
		return C.ERR_NOT_ENOUGH_RESOURCES;
	}
	return C.OK;
}

export function checkLaunchNuke(nuker: StructureNuker, target: RoomPosition) {
	return chainIntentChecks(
		() => checkMyStructure(nuker, StructureNuker),
		() => checkLaunchTarget(target),
		() => checkLaunchCooldown(nuker),
		() => checkIsActive(nuker),
		// TODO: Return ERR_INVALID_TARGET for novice and respawn-area source or
		// destination rooms once room start areas are modeled.
		() => checkLaunchRange(nuker, target),
		() => checkLaunchResources(nuker),
	);
}
