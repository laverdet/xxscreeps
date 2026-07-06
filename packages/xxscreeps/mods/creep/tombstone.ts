import type { ResourceType } from 'xxscreeps/mods/resource/resource.js';
import { Fn } from 'xxscreeps/functional/fn.js';
import * as C from 'xxscreeps/game/constants/index.js';
import { Game } from 'xxscreeps/game/index.js';
import { RoomObject, createRoomObject, requiredExpiryTime } from 'xxscreeps/game/object.js';
import { OpenStore } from 'xxscreeps/mods/resource/store.js';
import { lookForStructureAt } from 'xxscreeps/mods/structure/structure.js';
import { withOverlay } from 'xxscreeps/schema/index.js';
import { Creep } from './creep.js';
import { tombstoneShape } from './schema.js';

/**
 * A remnant of dead creeps. This is a walkable object.
 */
export class Tombstone extends withOverlay(RoomObject, tombstoneShape) {

	/**
	 * The amount of game ticks before this tombstone decays.
	 */
	@enumerable get ticksToDecay() { return requiredExpiryTime(this['#decayTime']); }

	override get '#lookType'() { return C.LOOK_TOMBSTONES; }

	override '#applyNukeImpact'() {
		this['#destroy'](C.EVENT_ATTACK_TYPE_NUKE);
	}

	/**
	 * An object containing the deceased creep.
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

}

export function buryCreep(creep: Creep, rate = C.CREEP_CORPSE_RATE) {
	const tombstone = createRoomObject(new Tombstone(), creep.pos);
	tombstone.deathTime = Game.time;
	tombstone.store = new OpenStore();

	if (rate > 0) {
		const lifeTime = creep.body.some(part => part.type === C.CLAIM)
			? C.CREEP_CLAIM_LIFE_TIME : C.CREEP_LIFE_TIME;
		const lifeRate = rate * (creep.ticksToLive ?? 0) / lifeTime;
		let bodyEnergy = 0;
		const bodyBoosts = new Map<ResourceType, number>();
		for (const part of creep.body) {
			if (part.boost !== undefined) {
				bodyBoosts.set(part.boost,
					(bodyBoosts.get(part.boost) ?? 0) + C.LAB_BOOST_MINERAL * lifeRate);
				bodyEnergy += C.LAB_BOOST_ENERGY * lifeRate;
			}
			bodyEnergy += Math.min(C.CREEP_PART_MAX_ENERGY, C.BODYPART_COST[part.type] * lifeRate);
		}
		// Same-tile container absorbs resources before the tombstone, matching vanilla.
		const container = lookForStructureAt(creep.room, creep.pos, C.STRUCTURE_CONTAINER);
		const deposit = (type: ResourceType, amount: number) => {
			if (amount <= 0) return;
			if (container !== undefined && container.hits > 0) {
				const toContainer = Math.min(amount, container.store.getFreeCapacity(type));
				if (toContainer > 0) {
					container.store['#add'](type, toContainer);
					const remaining = amount - toContainer;
					if (remaining > 0) tombstone.store['#add'](type, remaining);
					return;
				}
			}
			tombstone.store['#add'](type, amount);
		};
		deposit(C.RESOURCE_ENERGY, Math.floor(bodyEnergy));
		for (const [ mineral, amount ] of bodyBoosts) deposit(mineral, Math.floor(amount));
		for (const [ type, amount ] of creep.store['#entries']()) deposit(type, amount);
	}

	const saying = creep['#saying'];
	tombstone['#creep'] = {
		body: creep.body.map(bodyPart => bodyPart.type),
		id: creep.id,
		name: creep.name,
		saying: saying?.isPublic && saying.time === Game.time ? saying.message : undefined,
		ticksToLive: creep.ticksToLive!,
		user: creep['#user'],
	};
	tombstone['#decayTime'] = Game.time + creep.body.length * C.TOMBSTONE_DECAY_PER_PART;
	creep.room['#insertObject'](tombstone);
	creep['#destroy']();
}
