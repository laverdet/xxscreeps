import * as C from 'xxscreeps/game/constants';
import * as Id from 'xxscreeps/engine/schema/id';
import { RoomObject, format as objectFormat } from 'xxscreeps/game/object';
import { OwnedStructure, Structure } from 'xxscreeps/mods/structure/structure';
import { Game } from 'xxscreeps/game';
import { compose, declare, struct, variant, withOverlay } from 'xxscreeps/schema';
import { openStoreFormat } from 'xxscreeps/mods/resource/store';

export const format = declare('Ruin', () => compose(shape, Ruin));
const shape = struct(objectFormat, {
	...variant('ruin'),
	destroyTime: 'int32',
	store: openStoreFormat,
	'#decayTime': 'int32',
	'#structure': struct({
		id: Id.format,
		hitsMax: 'int32',
		type: 'string',
		user: Id.optionalFormat,
	}),
});

/**
 * A destroyed structure. This is a walkable object.
 */
export class Ruin extends withOverlay(RoomObject, shape) {
	override get ['#lookType']() { return C.LOOK_RUINS }

	/**
	 * An object containing basic data of the destroyed structure.
	 */
	get structure() {
		const info = this['#structure'];
		const structure = (() => {
			if (info.user) {
				const structure = new OwnedStructure;
				structure['#user'] = info.user;
				return structure;
			} else {
				return new Structure;
			}
		})();
		Object.defineProperties(structure, {
			id: { enumerable: true, get: () => info.id },
			hits: { enumerable: true, get: () => 0 },
			hitsMax: { enumerable: true, get: () => info.hitsMax },
			pos: { enumerable: true, get: () => this.pos },
			structureType: { enumerable: true, get: () => info.type },
		});
		Object.defineProperty(this, 'structure', { value: structure });
		return structure;
	}

	/**
	 * The amount of game ticks before this ruin decays.
	 */
	@enumerable get ticksToDecay() { return Math.max(0, this['#decayTime'] - Game.time) }
}
