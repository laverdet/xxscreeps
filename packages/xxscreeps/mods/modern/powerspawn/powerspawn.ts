import { chainIntentChecks } from 'xxscreeps/game/checks.js';
import { intents } from 'xxscreeps/game/index.js';
import { createRoomObject } from 'xxscreeps/game/object.js';
import { RoomPosition } from 'xxscreeps/game/position.js';
import { registerBuildableStructure } from 'xxscreeps/mods/classic/construction/game.js';
import { OwnedStructure, checkIsActive, checkMyStructure, checkPlacement } from 'xxscreeps/mods/classic/structure/structure.js';
import { withOverlay } from 'xxscreeps/schema/index.js';
import { assign } from 'xxscreeps/utility/utility.js';
import * as C from 'xxscreeps:mods/constants';
import { powerSpawnShape } from './schema.js';
import { PowerSpawnStore } from './store.js';

/**
 * Processes power into your account, and spawns power creeps with special unique powers (in
 * development). Learn more about power from [this article](https://docs.screeps.com/power.html).
 * @public
 * @see https://docs.screeps.com/api/#StructurePowerSpawn
 */
export class StructurePowerSpawn extends withOverlay(OwnedStructure, powerSpawnShape) {
	/**
	 * An alias for `.store[RESOURCE_ENERGY]`.
	 * @public
	 * @deprecated
	 * @see https://docs.screeps.com/api/#StructurePowerSpawn.energy
	 */
	@enumerable get energy() { return this.store[C.RESOURCE_ENERGY]; }

	/**
	 * An alias for `.store.getCapacity(RESOURCE_ENERGY)`.
	 * @public
	 * @deprecated
	 * @see https://docs.screeps.com/api/#StructurePowerSpawn.energyCapacity
	 */
	@enumerable get energyCapacity() { return this.store.getCapacity(C.RESOURCE_ENERGY); }

	/**
	 * An alias for `.store[RESOURCE_POWER]`.
	 * @public
	 * @deprecated
	 * @see https://docs.screeps.com/api/#StructurePowerSpawn.power
	 */
	@enumerable get power() { return this.store[C.RESOURCE_POWER]; }

	/**
	 * An alias for `.store.getCapacity(RESOURCE_POWER)`.
	 * @public
	 * @deprecated
	 * @see https://docs.screeps.com/api/#StructurePowerSpawn.powerCapacity
	 */
	@enumerable get powerCapacity() { return this.store.getCapacity(C.RESOURCE_POWER); }

	/**
	 * The total amount of hit points of the structure.
	 * @public
	 * @see https://docs.screeps.com/api/#StructurePowerSpawn.hitsMax
	 */
	override get hitsMax() { return C.POWER_SPAWN_HITS; }

	/**
	 * One of the `STRUCTURE_*` constants.
	 * @public
	 * @see https://docs.screeps.com/api/#StructurePowerSpawn.structureType
	 */
	override get structureType() { return C.STRUCTURE_POWER_SPAWN; }

	/**
	 * Register power resource units into your account. Registered power allows to develop power
	 * creeps skills. Consumes 1 power plus `POWER_SPAWN_ENERGY_RATIO` energy each tick the intent is
	 * issued, raising the owner's GPL.
	 * @returns One of the following codes: `OK`, `ERR_NOT_OWNER`, `ERR_NOT_ENOUGH_RESOURCES`,
	 * `ERR_RCL_NOT_ENOUGH`
	 * @public
	 * @see https://docs.screeps.com/api/#StructurePowerSpawn.processPower
	 */
	processPower() {
		return chainIntentChecks(
			() => checkProcessPower(this),
			() => intents.save(this, 'processPower'));
	}
}

export function create(pos: RoomPosition, owner: string) {
	const powerSpawn = assign(createRoomObject(new StructurePowerSpawn(), pos), {
		hits: C.POWER_SPAWN_HITS,
		store: new PowerSpawnStore(),
	});
	powerSpawn['#user'] = owner;
	return powerSpawn;
}

registerBuildableStructure(C.STRUCTURE_POWER_SPAWN, {
	obstacle: true,
	checkPlacement(room, pos) {
		return checkPlacement(room, pos) === C.OK ? C.CONSTRUCTION_COST.powerSpawn : null;
	},
	create(site) {
		return create(site.pos, site['#user']);
	},
});

function checkProcessResources(powerSpawn: StructurePowerSpawn) {
	if (
		powerSpawn.store[C.RESOURCE_POWER] < 1 ||
		powerSpawn.store[C.RESOURCE_ENERGY] < C.POWER_SPAWN_ENERGY_RATIO
	) {
		return C.ERR_NOT_ENOUGH_RESOURCES;
	}
	return C.OK;
}

export function checkProcessPower(powerSpawn: StructurePowerSpawn) {
	return chainIntentChecks(
		() => checkMyStructure(powerSpawn, StructurePowerSpawn),
		() => checkIsActive(powerSpawn),
		() => checkProcessResources(powerSpawn),
	);
}
