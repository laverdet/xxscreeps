import type { RoomPosition } from 'xxscreeps/game/position';
import * as C from 'xxscreeps/game/constants';
import * as RoomObject from 'xxscreeps/game/object';
import * as Store from 'xxscreeps/mods/resource/store';
import { Game, registerGlobal } from 'xxscreeps/game';
import { OwnedStructure, checkPlacement, ownedStructureFormat } from 'xxscreeps/mods/structure/structure';
import { compose, declare, struct, variant, withOverlay } from 'xxscreeps/schema';
import { assign } from 'xxscreeps/utility/utility';
import { registerBuildableStructure } from 'xxscreeps/mods/construction';
import { resourceEnumFormat } from 'xxscreeps/mods/resource/resource';

export const format = () => compose(shape, StructureLab);
const shape = declare('Lab', struct(ownedStructureFormat, {
	...variant('lab'),
	hits: 'int32',
	mineralType: resourceEnumFormat,
	store: Store.format,
	'#cooldownTime': 'int32',
}));

export class StructureLab extends withOverlay(OwnedStructure, shape) {
	get cooldown() { return Math.max(0, this['#cooldownTime'] - Game.time) }
	get hitsMax() { return C.LAB_HITS }
	get structureType() { return C.STRUCTURE_LAB }
}

export function create(pos: RoomPosition, owner: string) {
	const lab = assign(RoomObject.create(new StructureLab, pos), {
		hits: C.LAB_HITS,
		store: Store.create(C.LAB_ENERGY_CAPACITY + C.LAB_MINERAL_CAPACITY),
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
