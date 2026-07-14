import type { RoomPosition } from 'xxscreeps/game/position.js';
import * as C from 'xxscreeps/game/constants/index.js';
import { registerGlobal } from 'xxscreeps/game/index.js';
import { cooldownTime, createRoomObject } from 'xxscreeps/game/object.js';
import { registerBuildableStructure } from 'xxscreeps/mods/classic/construction/index.js';
import { OwnedStructure } from 'xxscreeps/mods/classic/structure/structure.js';
import { withOverlay } from 'xxscreeps/schema/index.js';
import { assign } from 'xxscreeps/utility/utility.js';
import { extractorShape } from './schema.js';

export class StructureExtractor extends withOverlay(OwnedStructure, extractorShape) {
	@enumerable get cooldown() { return cooldownTime(this['#cooldownTime']); }
	override get hitsMax() { return C.EXTRACTOR_HITS; }
	override get structureType() { return C.STRUCTURE_EXTRACTOR; }
}

export function create(pos: RoomPosition, owner: string) {
	const extractor = assign(createRoomObject(new StructureExtractor(), pos), {
		hits: C.EXTRACTOR_HITS,
	});
	extractor['#user'] = owner;
	return extractor;
}

// `ConstructionSite` registration
registerBuildableStructure(C.STRUCTURE_EXTRACTOR, {
	obstacle: true,
	checkPlacement(room, pos) {
		return room.lookForAt(C.LOOK_MINERALS, pos).length > 0
			? C.CONSTRUCTION_COST.extractor : null;
	},
	create(site) {
		return create(site.pos, site['#user']);
	},
});

// Export `StructureExtractor` to runtime globals
registerGlobal(StructureExtractor);

// ---

declare module 'xxscreeps/game/runtime.js' {
	interface Global { StructureExtractor: typeof StructureExtractor }
}
