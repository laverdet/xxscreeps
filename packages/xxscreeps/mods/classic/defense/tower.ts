import type { RoomPosition } from 'xxscreeps/game/position.js';
import { chainIntentChecks, checkSameRoom, checkTarget } from 'xxscreeps/game/checks.js';
import { intents } from 'xxscreeps/game/index.js';
import { createRoomObject } from 'xxscreeps/game/object.js';
import { checkDestructible } from 'xxscreeps/mods/classic/combat/creep.js';
import { registerBuildableStructure } from 'xxscreeps/mods/classic/construction/game.js';
import { Creep } from 'xxscreeps/mods/classic/creep/creep.js';
import { SingleStore, checkHasResource } from 'xxscreeps/mods/classic/resource/store.js';
import { OwnedStructure, Structure, checkIsActive, checkMyStructure, checkPlacement } from 'xxscreeps/mods/classic/structure/structure.js';
import { withOverlay } from 'xxscreeps/schema/index.js';
import { assign } from 'xxscreeps/utility/utility.js';
import * as C from 'xxscreeps:mods/constants';
import { towerShape } from './schema.js';

/**
 * Remotely attacks or heals creeps, or repairs structures. Can be targeted to any object in the
 * room. However, its effectiveness linearly depends on the distance. Each action consumes energy.
 * @public
 * @see https://docs.screeps.com/api/#StructureTower
 */
export class StructureTower extends withOverlay(OwnedStructure, towerShape) {
	override get hitsMax() { return C.TOWER_HITS; }
	override get structureType() { return C.STRUCTURE_TOWER; }

	/**
	 * An alias for
	 * [`.store[RESOURCE_ENERGY]`](https://docs.screeps.com/api/#StructureExtension.store).
	 * @public
	 * @deprecated
	 * @see https://docs.screeps.com/api/#StructureTower.energy
	 */
	get energy() { return this.store[C.RESOURCE_ENERGY]; }

	/**
	 * An alias for
	 * [`.store.getCapacity(RESOURCE_ENERGY)`](https://docs.screeps.com/api/#Store.getCapacity).
	 * @public
	 * @deprecated
	 * @see https://docs.screeps.com/api/#StructureTower.energyCapacity
	 */
	get energyCapacity() { return this.store.getCapacity(C.RESOURCE_ENERGY); }

	/**
	 * Remotely attack any creep, power creep or structure in the room.
	 * @param target The target object.
	 * @returns One of the following codes: `OK`, `ERR_NOT_OWNER`, `ERR_NOT_ENOUGH_ENERGY`,
	 * `ERR_INVALID_TARGET`, `ERR_RCL_NOT_ENOUGH`
	 * @public
	 * @see https://docs.screeps.com/api/#StructureTower.attack
	 */
	attack(target: Creep) {
		return chainIntentChecks(
			() => checkTower(this, target, Creep),
			() => intents.save(this, 'attack', target.id));
	}

	/**
	 * Remotely heal any creep or power creep in the room.
	 * @param target The target object.
	 * @returns One of the following codes: `OK`, `ERR_NOT_OWNER`, `ERR_NOT_ENOUGH_ENERGY`,
	 * `ERR_INVALID_TARGET`, `ERR_RCL_NOT_ENOUGH`
	 * @public
	 * @see https://docs.screeps.com/api/#StructureTower.heal
	 */
	heal(target: Creep) {
		return chainIntentChecks(
			() => checkTower(this, target, Creep),
			() => intents.save(this, 'heal', target.id));
	}

	/**
	 * Remotely repair any structure in the room.
	 * @param target The target structure.
	 * @returns One of the following codes: `OK`, `ERR_NOT_OWNER`, `ERR_NOT_ENOUGH_ENERGY`,
	 * `ERR_INVALID_TARGET`, `ERR_RCL_NOT_ENOUGH`
	 * @public
	 * @see https://docs.screeps.com/api/#StructureTower.repair
	 */
	repair(target: Structure) {
		return chainIntentChecks(
			() => checkTower(this, target, Structure),
			() => intents.save(this, 'repair', target.id));
	}
}

export function create(pos: RoomPosition, owner: string) {
	const tower = assign(createRoomObject(new StructureTower(), pos), {
		hits: C.TOWER_HITS,
		store: SingleStore['#create'](C.RESOURCE_ENERGY, C.TOWER_CAPACITY),
	});
	tower['#user'] = owner;
	return tower;
}

registerBuildableStructure(C.STRUCTURE_TOWER, {
	obstacle: true,
	checkPlacement(room, pos) {
		return checkPlacement(room, pos) === C.OK
			? C.CONSTRUCTION_COST.tower : null;
	},
	create(site) {
		return create(site.pos, site['#user']);
	},
});

export function checkTower<Type extends Creep | Structure>(
	tower: StructureTower, target: Type, targetType: abstract new(...args: any) => Type,
) {
	return chainIntentChecks(
		() => checkMyStructure(tower, StructureTower),
		() => checkTarget(target, targetType),
		() => checkDestructible(target),
		() => checkHasResource(tower, C.RESOURCE_ENERGY, C.TOWER_ENERGY_COST),
		() => checkIsActive(tower),
		() => checkSameRoom(tower, target));
}
