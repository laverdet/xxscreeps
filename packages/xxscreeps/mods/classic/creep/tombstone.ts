import { Fn } from 'xxscreeps/functional/fn.js';
import * as C from 'xxscreeps/game/constants/index.js';
import { RoomObject, requiredExpiryTime } from 'xxscreeps/game/object.js';
import { OpenStore } from 'xxscreeps/mods/classic/resource/store.js';
import { withOverlay } from 'xxscreeps/schema/index.js';
import { Creep } from './creep.js';
import { tombstoneShape } from './schema.js';

/**
 * A remnant of dead creeps. This is a walkable object.
 * @public
 * @see https://docs.screeps.com/api/#Tombstone
 */
export class Tombstone extends withOverlay(RoomObject, tombstoneShape) {

	/**
	 * The amount of game ticks before this tombstone decays.
	 * @public
	 * @see https://docs.screeps.com/api/#Tombstone.ticksToDecay
	 */
	@enumerable get ticksToDecay() { return requiredExpiryTime(this['#decayTime']); }

	/**
	 * An object containing the deceased creep.
	 * @public
	 * @see https://docs.screeps.com/api/#Tombstone.creep
	 */
	get creep() {
		const creep = new Creep();
		const creepInfo = this['#creep'];
		const carryCapacity = Fn.accumulate(creepInfo.body, type => type === C.CARRY ? C.CARRY_CAPACITY : 0);
		creep['#posId'] = this['#posId'];
		creep['#user'] = creepInfo.user;
		Object.defineProperties(creep, {
			body: { enumerable: true, value: creepInfo.body.map(type => ({ type, hits: 0 })) },
			id: { enumerable: true, get: () => creepInfo.id },
			name: { enumerable: true, get: () => creepInfo.name },
			pos: { enumerable: true, get: () => this.pos },
			saying: { enumerable: true, value: creepInfo.saying },
			spawning: { enumerable: true, value: false },
			store: { enumerable: true, value: OpenStore['#create'](carryCapacity) },
			ticksToLive: { enumerable: true, get: () => creepInfo.ticksToLive },
		});
		Object.defineProperty(this, 'creep', { value: creep });
		return creep;
	}

	override get '#lookType'() { return C.LOOK_TOMBSTONES; }

	override '#applyNukeImpact'() {
		this['#destroy'](C.EVENT_ATTACK_TYPE_NUKE);
	}
}
