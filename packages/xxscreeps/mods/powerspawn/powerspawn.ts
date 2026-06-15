import { chainIntentChecks } from 'xxscreeps/game/checks.js';
import * as C from 'xxscreeps/game/constants/index.js';
import { intents } from 'xxscreeps/game/index.js';
import * as RoomObject from 'xxscreeps/game/object.js';
import { RoomPosition } from 'xxscreeps/game/position.js';
import { registerBuildableStructure } from 'xxscreeps/mods/construction/index.js';
import { OwnedStructure, checkIsActive, checkMyStructure, checkPlacement, ownedStructureFormat } from 'xxscreeps/mods/structure/structure.js';
import { compose, declare, struct, variant, withOverlay } from 'xxscreeps/schema/index.js';
import { assign } from 'xxscreeps/utility/utility.js';
import { PowerSpawnStore, powerSpawnStoreFormat } from './store.js';

export const format = declare('PowerSpawn', () => compose(shape, StructurePowerSpawn));
const shape = struct(ownedStructureFormat, {
	...variant('powerSpawn'),
	hits: 'int32',
	store: powerSpawnStoreFormat,
});

export class StructurePowerSpawn extends withOverlay(OwnedStructure, shape) {
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
	const powerSpawn = assign(RoomObject.create(new StructurePowerSpawn(), pos), {
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
