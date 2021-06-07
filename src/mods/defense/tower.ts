import type { RoomPosition } from 'xxscreeps/game/position';
import * as C from 'xxscreeps/game/constants';
import { Creep } from 'xxscreeps/mods/creep/creep';
import { actionLogFormat, create as createObject } from 'xxscreeps/game/object';
import { OwnedStructure, Structure, checkMyStructure, checkPlacement, ownedStructureFormat } from 'xxscreeps/mods/structure/structure';
import { SingleStore, checkHasResource, singleStoreFormat } from 'xxscreeps/mods/resource/store';
import { compose, declare, struct, variant, withOverlay } from 'xxscreeps/schema';
import { assign } from 'xxscreeps/utility/utility';
import { registerBuildableStructure } from 'xxscreeps/mods/construction';
import { chainIntentChecks, checkSameRoom, checkTarget } from 'xxscreeps/game/checks';
import { checkDestructible } from 'xxscreeps/mods/combat/creep';
import { intents } from 'xxscreeps/game';

export const format = declare('Tower', () => compose(shape, StructureTower));
const shape = struct(ownedStructureFormat, {
	...variant('tower'),
	hits: 'int32',
	store: singleStoreFormat(),
	'#actionLog': actionLogFormat,
});

export class StructureTower extends withOverlay(OwnedStructure, shape) {
	override get hitsMax() { return C.TOWER_HITS }
	override get structureType() { return C.STRUCTURE_TOWER }
	get energy() { return this.store[C.RESOURCE_ENERGY] }
	get energyCapacity() { return this.store.getCapacity(C.RESOURCE_ENERGY) }

	/**
	 * Remotely attack any creep, power creep or structure in the room.
	 * @param target The target creep.
	 */
	attack(target: Creep) {
		return chainIntentChecks(
			() => checkTower(this, target, Creep),
			() => intents.save(this, 'attack', target.id));
	}

	/**
	 * Remotely heal any creep or power creep in the room.
	 * @param target The target creep.
	 */
	heal(target: Creep) {
		return chainIntentChecks(
			() => checkTower(this, target, Creep),
			() => intents.save(this, 'heal', target.id));
	}

	/**
	 * Remotely repair any structure in the room.
	 * @param target The target structure.
	 */
	repair(target: Structure) {
		return chainIntentChecks(
			() => checkTower(this, target, Structure),
			() => intents.save(this, 'heal', target.id));
	}
}

export function create(pos: RoomPosition, owner: string) {
	const tower = assign(createObject(new StructureTower, pos), {
		hits: C.TOWER_HITS,
		store: SingleStore['#create'](C.RESOURCE_ENERGY, C.TOWER_CAPACITY),
	});
	tower['#user'] = owner;
	return tower;
}

registerBuildableStructure(C.STRUCTURE_TOWER, {
	obstacle: true,
	checkPlacement(room, pos) {
		return checkPlacement(room, pos) === C.OK ?
			C.CONSTRUCTION_COST.tower : null;
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
		() => checkSameRoom(tower, target));
}
