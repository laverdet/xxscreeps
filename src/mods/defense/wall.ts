import type { RoomPosition } from 'xxscreeps/game/position.js';
import C from 'xxscreeps/game/constants/index.js';
import * as RoomObject from 'xxscreeps/game/object.js';
import { Structure, checkPlacement, structureFormat } from 'xxscreeps/mods/structure/structure.js';
import { compose, declare, struct, variant, withOverlay } from 'xxscreeps/schema/index.js';
import { assign } from 'xxscreeps/utility/utility.js';
import { registerBuildableStructure } from 'xxscreeps/mods/construction/index.js';

export const format = declare('Wall', () => compose(shape, StructureWall));
const shape = struct(structureFormat, {
	...variant('constructedWall'),
	hits: 'int32',
});

export class StructureWall extends withOverlay(Structure, shape) {
	override get hitsMax() {
		const level = this.room.controller?.level ?? 0;
		return C.CONTROLLER_STRUCTURES.constructedWall[level] ? C.WALL_HITS_MAX : 0;
	}

	override get structureType() { return C.STRUCTURE_WALL }
}

export function create(pos: RoomPosition) {
	return assign(RoomObject.create(new StructureWall, pos), {
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
