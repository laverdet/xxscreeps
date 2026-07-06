import type { RoomPosition } from 'xxscreeps/game/position.js';
import * as C from 'xxscreeps/game/constants/index.js';
import * as RoomObject from 'xxscreeps/game/object.js';
import { registerBuildableStructure } from 'xxscreeps/mods/construction/index.js';
import { Structure, checkPlacement } from 'xxscreeps/mods/structure/structure.js';
import { withOverlay } from 'xxscreeps/schema/index.js';
import { assign } from 'xxscreeps/utility/utility.js';
import { wallShape } from './schema.js';

export class StructureWall extends withOverlay(Structure, wallShape) {
	override get hitsMax() {
		const level = this.room.controller?.level ?? 0;
		return C.CONTROLLER_STRUCTURES.constructedWall[level] ? C.WALL_HITS_MAX : 0;
	}

	override get structureType() { return C.STRUCTURE_WALL; }

	@enumerable get ticksToLive(): number | undefined { return undefined; }
}

export function create(pos: RoomPosition) {
	return assign(RoomObject.createRoomObject(new StructureWall(), pos), {
		hits: 1,
	});
}

registerBuildableStructure(C.STRUCTURE_WALL, {
	obstacle: true,
	checkPlacement(room, pos) {
		return checkPlacement(room, pos) === C.OK ? 1 : null;
	},
	create(site) {
		return create(site.pos);
	},
});
