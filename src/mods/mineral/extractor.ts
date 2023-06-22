import type { RoomPosition } from 'xxscreeps/game/position.js';
import C from 'xxscreeps/game/constants/index.js';
import * as RoomObject from 'xxscreeps/game/object.js';
import { Game, registerGlobal } from 'xxscreeps/game/index.js';
import { OwnedStructure, ownedStructureFormat } from 'xxscreeps/mods/structure/structure.js';
import { compose, declare, struct, variant, withOverlay } from 'xxscreeps/schema/index.js';
import { assign } from 'xxscreeps/utility/utility.js';
import { registerBuildableStructure } from 'xxscreeps/mods/construction/index.js';

export const format = declare('Extractor', () => compose(shape, StructureExtractor));
const shape = struct(ownedStructureFormat, {
	...variant('extractor'),
	hits: 'int32',
	'#cooldownTime': 'int32',
});

export class StructureExtractor extends withOverlay(OwnedStructure, shape) {
	override get hitsMax() { return C.EXTRACTOR_HITS }
	@enumerable get cooldown() { return Math.max(0, this['#cooldownTime'] - Game.time) }
	override get structureType() { return C.STRUCTURE_EXTRACTOR }
}

export function create(pos: RoomPosition, owner: string) {
	const extractor = assign(RoomObject.create(new StructureExtractor, pos), {
		hits: C.EXTRACTOR_HITS,
	});
	extractor['#user'] = owner;
	return extractor;
}

// `ConstructionSite` registration
registerBuildableStructure(C.STRUCTURE_EXTRACTOR, {
	obstacle: true,
	checkPlacement(room, pos) {
		return room.lookForAt(C.LOOK_MINERALS, pos).length > 0 ?
			C.CONSTRUCTION_COST.extractor : null;
	},
	create(site) {
		return create(site.pos, site['#user']);
	},
});

// Export `StructureExtractor` to runtime globals
registerGlobal(StructureExtractor);
declare module 'xxscreeps/game/runtime' {
	interface Global { StructureExtractor: typeof StructureExtractor }
}
