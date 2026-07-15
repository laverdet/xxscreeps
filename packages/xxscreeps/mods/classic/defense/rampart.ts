import type { RoomObject } from 'xxscreeps/game/object.js';
import type { RoomPosition } from 'xxscreeps/game/position.js';
import * as C from 'xxscreeps/game/constants/index.js';
import { Game, intents, me } from 'xxscreeps/game/index.js';
import { createRoomObject, requiredExpiryTime } from 'xxscreeps/game/object.js';
import { registerBuildableStructure } from 'xxscreeps/mods/classic/construction/game.js';
import { OwnedStructure, checkPlacement } from 'xxscreeps/mods/classic/structure/structure.js';
import { withOverlay } from 'xxscreeps/schema/index.js';
import { asUnion, assign } from 'xxscreeps/utility/utility.js';
import { rampartShape } from './schema.js';

/**
 * Blocks movement of hostile creeps, and defends your creeps and structures on the same tile. Can
 * be used as a controllable gate.
 * @public
 * @see https://docs.screeps.com/api/#StructureRampart
 */
export class StructureRampart extends withOverlay(OwnedStructure, rampartShape) {
	/**
	 * The amount of game ticks when this rampart will lose some hit points.
	 * @public
	 * @see https://docs.screeps.com/api/#StructureRampart.ticksToDecay
	 */
	@enumerable get ticksToDecay() { return requiredExpiryTime(this['#nextDecayTime']); }

	override get hitsMax() {
		return this['#user'] === this.room.controller?.['#user']
			? C.RAMPART_HITS_MAX[this.room.controller.level] ?? 0 : 0;
	}

	override get structureType() { return C.STRUCTURE_RAMPART; }

	override get '#layer'() { return 1; }

	override '#captureDamage'(power: number, type: number, source: RoomObject | null) {
		const absorbed = Math.min(power, this.hits);
		if (absorbed > 0) {
			this['#applyDamage'](absorbed, type, source ?? undefined);
		}
		return power - absorbed;
	}

	/**
	 * Make this rampart public to allow other players' creeps to pass through.
	 * @param isPublic Whether this rampart should be public or non-public.
	 * @returns One of the following codes: `OK`, `ERR_NOT_OWNER`
	 * @public
	 * @see https://docs.screeps.com/api/#StructureRampart.setPublic
	 */
	setPublic(isPublic: boolean) {
		if (this['#user'] === me) {
			intents.save(this, 'setPublic', Boolean(isPublic));
			return C.OK;
		} else {
			return C.ERR_NOT_OWNER;
		}
	}

	override '#checkObstacle'(user: string) {
		return !this.isPublic && user !== this['#user'];
	}

	override '#doesPreventInteraction'(user: string) {
		return !this.isPublic && user !== this['#user'];
	}
}

export function create(pos: RoomPosition, owner: string) {
	const rampart = assign(createRoomObject(new StructureRampart(), pos), {
		hits: 1,
		isPublic: false,
	});
	rampart['#nextDecayTime'] = Game.time + C.RAMPART_DECAY_TIME - 1;
	rampart['#user'] = owner;
	return rampart;
}

registerBuildableStructure(C.STRUCTURE_RAMPART, {
	obstacle: false,
	stackable: true,
	checkPlacement(room, pos) {

		// Don't allow double ramparts
		for (const object of room['#lookAt'](pos)) {
			asUnion(object);
			if (object.structureType === 'rampart') {
				return null;
			}
		}
		return checkPlacement(room, pos) === C.OK ? 1 : null;
	},
	create(site) {
		return create(site.pos, site['#user']);
	},
});
