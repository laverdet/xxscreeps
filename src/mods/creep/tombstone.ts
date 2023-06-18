import C from 'xxscreeps/game/constants/index.js';
import * as Id from 'xxscreeps/engine/schema/id.js';
import { RoomObject, create as createObject, getById, format as objectFormat } from 'xxscreeps/game/object.js';
import { compose, declare, enumerated, optional, struct, variant, vector, withOverlay } from 'xxscreeps/schema/index.js';
import { Game } from 'xxscreeps/game/index.js';
import { OpenStore, openStoreFormat } from 'xxscreeps/mods/resource/store.js';
import { Creep } from './creep.js';
import { assign } from 'xxscreeps/utility/utility.js';

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
		super(idOrArg1, arg2)
		if (typeof idOrArg1 === 'string') assign<Tombstone>(this, getById(Tombstone, idOrArg1))
	}
	
	override get ['#lookType']() { return C.LOOK_TOMBSTONES }

	/**
	 * An object containing the deceased creep.
	 */
	get creep() {
		const creep = new Creep;
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

	/**
	 * The amount of game ticks before this tombstone decays.
	 */
	@enumerable get ticksToDecay() { return Math.max(0, this['#decayTime'] - Game.time) }
}

export function buryCreep(creep: Creep, rate = C.CREEP_CORPSE_RATE) {
	const tombstone = createObject(new Tombstone, creep.pos);
	tombstone.deathTime = Game.time;
	tombstone.store = new OpenStore;
	for (const [ resourceType, amount ] of creep.store['#entries']()) {
		tombstone.store['#add'](resourceType, Math.floor(amount * rate));
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
