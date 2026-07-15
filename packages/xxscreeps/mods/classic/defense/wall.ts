import type { RoomPosition } from 'xxscreeps/game/position.js';
import * as C from 'xxscreeps/game/constants/index.js';
import * as RoomObject from 'xxscreeps/game/object.js';
import { registerBuildableStructure } from 'xxscreeps/mods/classic/construction/index.js';
import { Structure, checkPlacement } from 'xxscreeps/mods/classic/structure/structure.js';
import { withOverlay } from 'xxscreeps/schema/index.js';
import { assign } from 'xxscreeps/utility/utility.js';
import { wallShape } from './schema.js';

/**
 * Blocks movement of all creeps. Players can build destructible walls in controlled rooms. Some
 * rooms also contain indestructible walls separating novice and respawn areas from the rest of the
 * world or dividing novice / respawn areas into smaller sections. Indestructible walls have no
 * `hits` property.
 * @public
 * @see https://docs.screeps.com/api/#StructureWall
 */
export class StructureWall extends withOverlay(Structure, wallShape) {
	override get hitsMax() {
		const level = this.room.controller?.level ?? 0;
		return C.CONTROLLER_STRUCTURES.constructedWall[level] ? C.WALL_HITS_MAX : 0;
	}

	override get structureType() { return C.STRUCTURE_WALL; }

	/**
	 * The amount of game ticks when the wall will disappear. Only some automatically placed walls
	 * from novice or respawn areas have this property; it is always `undefined` in xxscreeps. This
	 * property is no longer part of the official API.
	 * @public
	 * @deprecated
	 */
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
