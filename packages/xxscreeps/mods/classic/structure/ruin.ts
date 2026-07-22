import type { Store } from 'xxscreeps/mods/classic/resource/store.js';
import { Game } from 'xxscreeps/game/index.js';
import { RoomObject, cooldownTime, createRoomObject } from 'xxscreeps/game/object.js';
import { OpenStore } from 'xxscreeps/mods/classic/resource/store.js';
import { withOverlay } from 'xxscreeps/schema/index.js';
import * as C from 'xxscreeps:mods/constants';
import { ruinShape } from './schema.js';
import { OwnedStructure, Structure } from './structure.js';

/**
 * A destroyed structure. This is a walkable object. Decays in 500 ticks except some special cases.
 * @public
 * @see https://docs.screeps.com/api/#Ruin
 */
export class Ruin extends withOverlay(RoomObject, ruinShape) {

	/**
	 * The amount of game ticks before this ruin decays.
	 * @public
	 * @see https://docs.screeps.com/api/#Ruin.ticksToDecay
	 */
	@enumerable get ticksToDecay() { return cooldownTime(this['#decayTime']); }

	/**
	 * One of the `STRUCTURE_*` constants — the type of the destroyed structure.
	 * @public
	 */
	@enumerable get structureType() { return this['#structure'].type; }

	override get '#lookType'() { return C.LOOK_RUINS; }
	override get '#extraUsers'() {
		const user = this['#structure'].user;
		return user === null ? [] : [ user ];
	}

	override '#applyNukeImpact'() {
		this['#destroy'](C.EVENT_ATTACK_TYPE_NUKE);
	}

	/**
	 * An object containing basic data of the destroyed structure.
	 * @public
	 * @see https://docs.screeps.com/api/#Ruin.structure
	 */
	get structure() {
		const info = this['#structure'];
		const structure = (() => {
			if (info.user === null) {
				return new Structure();
			} else {
				const structure = new OwnedStructure();
				structure['#user'] = info.user;
				return structure;
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
}

export function createRuin(structure: Structure, decay?: number) {
	const ruin = createRoomObject(new Ruin(), structure.pos);
	ruin.store = new OpenStore();
	const withStore = structure as never as Record<'store', Store | undefined>;
	if (withStore.store) {
		for (const [ resourceType, amount ] of withStore.store['#entries']()) {
			ruin.store['#add'](resourceType, amount);
		}
	}
	ruin.destroyTime = Game.time;

	const decayTimeout = decay ?? (C.RUIN_DECAY_STRUCTURES[structure.structureType] ?? C.RUIN_DECAY);
	ruin['#decayTime'] = Game.time + decayTimeout;
	ruin['#structure'] = {
		id: structure.id,
		hitsMax: structure.hitsMax ?? 0,
		type: structure.structureType,
		user: structure['#user'],
	};
	return ruin;
}
