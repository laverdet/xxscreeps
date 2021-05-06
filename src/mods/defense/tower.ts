import type { Creep } from 'xxscreeps/mods/creep/creep';
import type { RoomPosition } from 'xxscreeps/game/position';
import * as C from 'xxscreeps/game/constants';
import * as RoomObject from 'xxscreeps/game/object';
import * as Store from 'xxscreeps/mods/resource/store';
import { Structure, checkPlacement, structureFormat } from 'xxscreeps/mods/structure/structure';
import { compose, declare, struct, variant, withOverlay } from 'xxscreeps/schema';
import { assign } from 'xxscreeps/utility/utility';
import { registerBuildableStructure } from 'xxscreeps/mods/construction';

export const format = () => compose(shape, StructureTower);
const shape = declare('Tower', struct(structureFormat, {
	...variant('tower'),
	store: Store.restrictedFormat<'energy'>(),
}));

export class StructureTower extends withOverlay(Structure, shape) {
	get energy() { return this.store[C.RESOURCE_ENERGY] }
	get energyCapacity() { return this.store.getCapacity(C.RESOURCE_ENERGY) }
	get structureType() { return C.STRUCTURE_TOWER }

	/**
	 * Remotely attack any creep, power creep or structure in the room.
	 * @param target The target creep.
	 */
	attack(_target: Creep) {
		console.error('TODO: attack');
	}

	/**
	 * Remotely heal any creep or power creep in the room.
	 * @param target The target creep.
	 */
	heal(_target: Creep) {
		console.error('TODO: heal');
	}

	/**
	 * Remotely repair any structure in the room.
	 * @param target The target structure.
	 */
	repair(_target: Structure) {
		console.error('TODO: repair');
	}
}

export function create(pos: RoomPosition, owner: string) {
	return assign(RoomObject.create(new StructureTower, pos), {
		hits: C.TOWER_HITS,
		store: Store.create(null, { energy: C.TOWER_CAPACITY }),
		[RoomObject.Owner]: owner,
	});
}

registerBuildableStructure(C.STRUCTURE_TOWER, {
	obstacle: true,
	checkPlacement(room, pos) {
		return checkPlacement(room, pos) === C.OK ?
			C.CONSTRUCTION_COST.tower : null;
	},
	create(site) {
		return create(site.pos, site.owner);
	},
});
