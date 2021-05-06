import type { RoomPosition } from 'xxscreeps/game/position';
import * as C from 'xxscreeps/game/constants';
import * as RoomObject from 'xxscreeps/game/object';
import { Game, registerGlobal } from 'xxscreeps/game';
import { Structure, structureFormat } from 'xxscreeps/mods/structure/structure';
import { XSymbol, compose, declare, struct, variant, withOverlay } from 'xxscreeps/schema';
import { assign } from 'xxscreeps/utility/utility';
import { registerBuildableStructure } from 'xxscreeps/mods/construction';

export const CooldownTime = XSymbol('cooldownTime');

export const format = () => compose(shape, StructureExtractor);
const shape = declare('Extractor', struct(structureFormat, {
	...variant('extractor'),
	[CooldownTime]: 'int32',
}));

export class StructureExtractor extends withOverlay(Structure, shape) {
	get cooldown() { return Math.max(0, this[CooldownTime] - Game.time) }
	get structureType() { return C.STRUCTURE_EXTRACTOR }
}

export function create(pos: RoomPosition, owner: string) {
	return assign(RoomObject.create(new StructureExtractor, pos), {
		hits: C.EXTRACTOR_HITS,
		[RoomObject.Owner]: owner,
	});
}

// `ConstructionSite` registration
registerBuildableStructure(C.STRUCTURE_EXTRACTOR, {
	obstacle: true,
	checkPlacement(room, pos) {
		return room.lookForAt(C.LOOK_MINERALS, pos).length > 0 ?
			C.CONSTRUCTION_COST.extractor : null;
	},
	create(site) {
		return create(site.pos, site.owner);
	},
});

// Export `StructureExtractor` to runtime globals
registerGlobal(StructureExtractor);
declare module 'xxscreeps/game/runtime' {
	interface Global { StructureExtractor: typeof StructureExtractor }
}
