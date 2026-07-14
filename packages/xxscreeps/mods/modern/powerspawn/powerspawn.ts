import { chainIntentChecks } from 'xxscreeps/game/checks.js';
import * as C from 'xxscreeps/game/constants/index.js';
import { intents } from 'xxscreeps/game/index.js';
import { createRoomObject } from 'xxscreeps/game/object.js';
import { RoomPosition } from 'xxscreeps/game/position.js';
import { registerBuildableStructure } from 'xxscreeps/mods/classic/construction/index.js';
import { OwnedStructure, checkIsActive, checkMyStructure, checkPlacement } from 'xxscreeps/mods/classic/structure/structure.js';
import { withOverlay } from 'xxscreeps/schema/index.js';
import { assign } from 'xxscreeps/utility/utility.js';
import { powerSpawnShape } from './schema.js';
import { PowerSpawnStore } from './store.js';

export class StructurePowerSpawn extends withOverlay(OwnedStructure, powerSpawnShape) {
	/** @deprecated */
	@enumerable get energy() { return this.store[C.RESOURCE_ENERGY]; }
	/** @deprecated */
	@enumerable get energyCapacity() { return this.store.getCapacity(C.RESOURCE_ENERGY); }
	/** @deprecated */
	@enumerable get power() { return this.store[C.RESOURCE_POWER]; }
	/** @deprecated */
	@enumerable get powerCapacity() { return this.store.getCapacity(C.RESOURCE_POWER); }

	override get hitsMax() { return C.POWER_SPAWN_HITS; }
	override get structureType() { return C.STRUCTURE_POWER_SPAWN; }

	/**
	 * Register power to be processed by the spawn. Consumes 1 power plus
	 * `POWER_SPAWN_ENERGY_RATIO` energy each tick the intent is issued, raising the owner's GPL.
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
