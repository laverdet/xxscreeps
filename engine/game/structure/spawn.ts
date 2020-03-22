import * as Structure from '.';
import * as C from '~/engine/game/constants';
import { checkCast, withType, Format, Inherit, Interceptor, Variant } from '~/engine/schema';
import { gameContext } from '../context';
import { calcCreepCost, getUniqueName } from '../helpers';
import * as Store from '../store';

export const format = withType<StructureSpawn>(checkCast<Format>()({
	[Inherit]: Structure.format,
	[Variant]: 'spawn',
	name: 'string',
	store: Store.format,
}));

type SpawnCreepOptions = {
	body?: C.BodyPart[];
	directions?: number[];
	dryRun?: boolean;
	memory?: any;
};

export class StructureSpawn extends Structure.Structure {
	get [Variant]() { return 'spawn' }
	get structureType() { return C.STRUCTURE_SPAWN }

	get energy() { return this.store[C.RESOURCE_ENERGY] }
	get energyCapacity() { return this.store.getCapacity(C.RESOURCE_ENERGY) }

	name!: string;
	spawning!: any;
	store!: Store.Store;

	canCreateCreep(body: any, name?: any) {
		return this.spawnCreep(
			body,
			name ?? getUniqueName(name => Game.creeps[name] !== undefined),
			{ dryRun: true },
		);
	}

	createCreep(body: any, name: any, memory: any) {
		return this.spawnCreep(
			body,
			name ?? getUniqueName(name => Game.creeps[name] !== undefined),
			{ memory },
		);
	}

	spawnCreep(body: any, name: any, options: SpawnCreepOptions = {}) {

		// Check name is valid and does not already exist
		if (name == false || typeof options !== 'object') {
			return C.ERR_INVALID_ARGS;
		}
		if (Game.creeps[name] !== undefined || gameContext.createdCreepNames.has(name)) {
			return C.ERR_NAME_EXISTS;
		}

		// Check direction sanity
		let { directions } = options;
		if (directions !== undefined) {
			if (!Array.isArray(directions)) {
				return C.ERR_INVALID_ARGS;
			}
			// Convert to numbers, filter duplicates
			directions = Array.from(new Set(directions.map(direction => +direction)));
			// Bail if out of range
			if (directions.length === 0 || directions.some(dir => dir < 1 || dir > 8 || !Number.isInteger(dir))) {
				return C.ERR_INVALID_ARGS;
			}
		}

		if (!this.my) {
			return C.ERR_NOT_OWNER;
		}

		// TODO: spawning, RCL

		if (!Array.isArray(body) || body.length === 0 || body.length > C.MAX_CREEP_SIZE) {
			return C.ERR_INVALID_ARGS;
		}
		if (!body.every(part => C.BODYPARTS_ALL.includes(part))) {
			return C.ERR_INVALID_ARGS;
		}

		// TODO: energyStructures

		if (this.room.energyAvailable < calcCreepCost(body)) {
			return C.ERR_NOT_ENOUGH_ENERGY;
		}
		if (options.dryRun == true) {
			return C.OK;
		}

		gameContext.createdCreepNames.add(name);

		// TODO: memory

		// TODO: fake creep object

		gameContext.intents.save(this, 'createCreep', { name, body, directions });
		return C.OK;
	}
}

export const interceptors = checkCast<Interceptor>()({
	overlay: StructureSpawn,
});
