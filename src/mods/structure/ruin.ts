import type { Store } from 'xxscreeps/mods/resource/store';
import C from 'xxscreeps/game/constants';
import * as Id from 'xxscreeps/engine/schema/id';
import { RoomObject, create as createObject, format as objectFormat } from 'xxscreeps/game/object';
import { OwnedStructure, Structure } from 'xxscreeps/mods/structure/structure';
import { Game } from 'xxscreeps/game';
import { compose, declare, struct, variant, withOverlay } from 'xxscreeps/schema';
import { OpenStore, openStoreFormat } from 'xxscreeps/mods/resource/store';

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
	override get ['#extraUsers']() {
		const user = this['#structure'].user;
		return user ? [ user ] : [];
	}

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

export function createRuin(structure: Structure, decay?: number) {
	const ruin = createObject(new Ruin, structure.pos);
	ruin.store = new OpenStore;
	const withStore = structure as never as Record<'store', Store | undefined>;
	if (withStore.store) {
		for (const [ resourceType, amount ] of withStore.store['#entries']()) {
			ruin.store['#add'](resourceType, amount);
		}
	}
	ruin.destroyTime = Game.time;
	// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
	const decayTimeout = decay ?? (C.RUIN_DECAY_STRUCTURES[structure.structureType as keyof typeof C.RUIN_DECAY_STRUCTURES] ?? C.RUIN_DECAY);
	ruin['#decayTime'] = Game.time + decayTimeout;
	ruin['#structure'] = {
		id: structure.id,
		hitsMax: structure.hitsMax ?? 0,
		type: structure.structureType,
		user: structure['#user'],
	};
	return ruin;
}
