import type { RoomPosition } from 'xxscreeps/game/position';
import * as C from 'xxscreeps/game/constants';
import * as RoomObject from 'xxscreeps/game/object';
import { Game, registerGlobal } from 'xxscreeps/game';
import { OwnedStructure, checkPlacement, ownedStructureFormat } from 'xxscreeps/mods/structure/structure';
import { RestrictedStore, restrictedStoreFormat } from 'xxscreeps/mods/resource/store';
import { compose, declare, struct, variant, withOverlay } from 'xxscreeps/schema';
import { assign } from 'xxscreeps/utility/utility';
import { registerBuildableStructure } from 'xxscreeps/mods/construction';
import { resourceEnumFormat } from 'xxscreeps/mods/resource/resource';

export const format = declare('Lab', () => compose(shape, StructureLab));
const shape = struct(ownedStructureFormat, {
	...variant('lab'),
	hits: 'int32',
	mineralType: resourceEnumFormat,
	store: restrictedStoreFormat,
	'#cooldownTime': 'int32',
});

export class StructureLab extends withOverlay(OwnedStructure, shape) {
	override get hitsMax() { return C.LAB_HITS }
	override get structureType() { return C.STRUCTURE_LAB }
	@enumerable get cooldown() { return Math.max(0, this['#cooldownTime'] - Game.time) }
}

export function create(pos: RoomPosition, owner: string) {
	const lab = assign(RoomObject.create(new StructureLab, pos), {
		hits: C.LAB_HITS,
		store: RestrictedStore['#create']({ [C.RESOURCE_ENERGY]: C.LAB_ENERGY_CAPACITY }),
	});
	lab['#user'] = owner;
	return lab;
}

// `ConstructionSite` registration
registerBuildableStructure(C.STRUCTURE_LAB, {
	obstacle: true,
	checkPlacement(room, pos) {
		return checkPlacement(room, pos) === C.OK ?
			C.CONSTRUCTION_COST.lab : null;
	},
	create(site) {
		return create(site.pos, site['#user']);
	},
});

// Export `StructureLab` to runtime globals
registerGlobal(StructureLab);
declare module 'xxscreeps/game/runtime' {
	interface Global { StructureLab: typeof StructureLab }
}
