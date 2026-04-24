import type { ResourceType } from 'xxscreeps/mods/resource/index.js';
import * as Id from 'xxscreeps/engine/schema/id.js';
import * as C from 'xxscreeps/game/constants/index.js';
import { Game } from 'xxscreeps/game/index.js';
import { RoomObject, create as createObject, getById, format as objectFormat } from 'xxscreeps/game/object.js';
import { OpenStore, openStoreFormat } from 'xxscreeps/mods/resource/store.js';
import { lookForStructureAt } from 'xxscreeps/mods/structure/structure.js';
import { compose, declare, enumerated, optional, struct, variant, vector, withOverlay } from 'xxscreeps/schema/index.js';
import { assign } from 'xxscreeps/utility/utility.js';
import { Creep } from './creep.js';

export const format = declare('Tombstone', () => compose(shape, Tombstone));
const shape = struct(objectFormat, {
	...variant('tombstone'),
	deathTime: 'int32',
	store: openStoreFormat,
	'#creep': struct({
		body: vector(enumerated(...C.BODYPARTS_ALL)),
		id: Id.format,
		name: 'string',
		saying: optional(struct({
			isPublic: 'bool',
			message: 'string',
			time: 'int32',
		})),
		ticksToLive: 'int32',
		user: Id.format,
	}),
	'#decayTime': 'int32',
});

/**
 * A remnant of dead creeps. This is a walkable object.
 */
export class Tombstone extends withOverlay(RoomObject, shape) {

	constructor(idOrArg1?: any, arg2?: any) {
		super(idOrArg1, arg2);
		if (typeof idOrArg1 === 'string') assign<Tombstone>(this, getById(Tombstone, idOrArg1));
	}

	/**
	 * The amount of game ticks before this tombstone decays.
	 */
	@enumerable get ticksToDecay() { return Math.max(0, this['#decayTime'] - Game.time); }

	override get '#lookType'() { return C.LOOK_TOMBSTONES; }

	/**
	 * An object containing the deceased creep.
	 */
	get creep() {
		const creep = new Creep();
		const creepInfo = this['#creep'];
		creep['#posId'] = this['#posId'];
		creep['#user'] = creepInfo.user;
		Object.defineProperties(creep, {
			body: { enumerable: true, get: () => creepInfo.body },
			id: { enumerable: true, get: () => creepInfo.id },
			name: { enumerable: true, get: () => creepInfo.name },
			pos: { enumerable: true, get: () => this.pos },
			store: { enumerable: true, get: () => this.store },
			ticksToLive: { enumerable: true, get: () => creepInfo.ticksToLive },
		});
		Object.defineProperty(this, 'creep', { value: creep });
		return creep;
	}

}

export function buryCreep(creep: Creep, rate = C.CREEP_CORPSE_RATE) {
	const tombstone = createObject(new Tombstone(), creep.pos);
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

	tombstone['#creep'] = {
		body: creep.body.map(bodyPart => bodyPart.type),
		id: creep.id,
		name: creep.name,
		saying: creep['#saying'],
		ticksToLive: creep.ticksToLive!,
		user: creep['#user'],
	};
	tombstone['#decayTime'] = Game.time + creep.body.length * C.TOMBSTONE_DECAY_PER_PART;
	creep.room['#insertObject'](tombstone);
	creep.room['#removeObject'](creep);
}
