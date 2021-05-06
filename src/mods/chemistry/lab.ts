import type { RoomPosition } from 'xxscreeps/game/position';
import * as C from 'xxscreeps/game/constants';
import * as RoomObject from 'xxscreeps/game/object';
import * as Store from 'xxscreeps/mods/resource/store';
import { Game, registerGlobal } from 'xxscreeps/game';
import { Structure, checkPlacement, structureFormat } from 'xxscreeps/mods/structure/structure';
import { XSymbol, compose, declare, struct, variant, withOverlay } from 'xxscreeps/schema';
import { assign } from 'xxscreeps/utility/utility';
import { registerBuildableStructure } from 'xxscreeps/mods/construction';
import { resourceEnumFormat } from 'xxscreeps/mods/resource/resource';

export const CooldownTime = XSymbol('cooldownTime');

export const format = () => compose(shape, StructureLab);
const shape = declare('Lab', struct(structureFormat, {
	...variant('lab'),
	mineralType: resourceEnumFormat,
	store: Store.format,
	[CooldownTime]: 'int32',
}));

export class StructureLab extends withOverlay(Structure, shape) {
	get cooldown() { return Math.max(0, this[CooldownTime] - Game.time) }
	get structureType() { return C.STRUCTURE_LAB }
}

export function create(pos: RoomPosition, owner: string) {
	return assign(RoomObject.create(new StructureLab, pos), {
		hits: C.LAB_HITS,
		store: Store.create(C.LAB_ENERGY_CAPACITY + C.LAB_MINERAL_CAPACITY),
		[RoomObject.Owner]: owner,
	});
}

// `ConstructionSite` registration
registerBuildableStructure(C.STRUCTURE_LAB, {
	obstacle: true,
	checkPlacement(room, pos) {
		return checkPlacement(room, pos) === C.OK ?
			C.CONSTRUCTION_COST.lab : null;
	},
	create(site) {
		return create(site.pos, site.owner);
	},
});

// Export `StructureLab` to runtime globals
registerGlobal(StructureLab);
declare module 'xxscreeps/game/runtime' {
	interface Global { StructureLab: typeof StructureLab }
}
