import type { RoomPosition } from 'xxscreeps/game/position';
import * as C from 'xxscreeps/game/constants';
import * as RoomObject from 'xxscreeps/game/object';
import { Structure, checkPlacement, structureFormat } from 'xxscreeps/mods/structure/structure';
import { compose, declare, struct, variant, withOverlay } from 'xxscreeps/schema';
import { assign } from 'xxscreeps/utility/utility';
import { registerBuildableStructure } from 'xxscreeps/mods/construction';

export const format = () => compose(shape, StructureWall);
const shape = declare('Wall', struct(structureFormat, {
	...variant('constructedWall'),
	hits: 'int32',
}));

export class StructureWall extends withOverlay(Structure, shape) {
	get hitsMax() {
		const level = this.room.controller?.level ?? 0;
		return C.CONTROLLER_STRUCTURES.constructedWall[level] ? C.WALL_HITS_MAX : 0;
	}

	get structureType() { return C.STRUCTURE_WALL }
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
