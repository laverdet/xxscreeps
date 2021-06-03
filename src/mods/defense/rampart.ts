import type { RoomPosition } from 'xxscreeps/game/position';
import * as C from 'xxscreeps/game/constants';
import * as RoomObject from 'xxscreeps/game/object';
import { Game, intents, me } from 'xxscreeps/game';
import { OwnedStructure, checkPlacement, ownedStructureFormat } from 'xxscreeps/mods/structure/structure';
import { compose, declare, struct, variant, withOverlay } from 'xxscreeps/schema';
import { asUnion, assign } from 'xxscreeps/utility/utility';
import { registerBuildableStructure } from 'xxscreeps/mods/construction';

export const format = declare('Rampart', () => compose(shape, StructureRampart));
const shape = struct(ownedStructureFormat, {
	...variant('rampart'),
	hits: 'int32',
	isPublic: 'bool',
	'#nextDecayTime': 'int32',
});

export class StructureRampart extends withOverlay(OwnedStructure, shape) {
	override get hitsMax() {
		return this['#user'] === this.room.controller?.['#user'] ?
			C.RAMPART_HITS_MAX[this.room.controller.level] ?? 0 : 0;
	}

	override get structureType() { return C.STRUCTURE_RAMPART }
	@enumerable get ticksToDecay() { return Math.max(0, this['#nextDecayTime'] - Game.time) }

	/**
	 * Make this rampart public to allow other players' creeps to pass through.
	 * @param isPublic Whether this rampart should be public or non-public.
	 */
	setPublic(isPublic: boolean) {
		if (this['#user'] === me) {
			intents.save(this, 'setPublic', Boolean(isPublic));
			return C.OK;
		} else {
			return C.ERR_NOT_OWNER;
		}
	}

	override ['#checkObstacle'](user: string) {
		return !this.isPublic && user !== this['#user'];
	}
}

export function create(pos: RoomPosition, owner: string) {
	const rampart = assign(RoomObject.create(new StructureRampart, pos), {
		hits: 1,
		isPublic: false,
	});
	rampart['#nextDecayTime'] = Game.time + C.RAMPART_DECAY_TIME - 1;
	rampart['#user'] = owner;
	return rampart;
}

registerBuildableStructure(C.STRUCTURE_RAMPART, {
	obstacle: undefined,
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
