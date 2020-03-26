import * as Structure from '.';
import * as C from '~/game/constants';
import * as Memory from '~/game/memory';
import { checkCast, makeOptional, withType, Format, Inherit, Interceptor, Variant } from '~/lib/schema';
import { gameContext } from '~/game/context';
import { calcCreepCost, getUniqueName } from '~/game/helpers';
import * as Store from '~/game/store';
import * as Spawning from './spawn/spawning';

export const format = withType<StructureSpawn>(checkCast<Format>()({
	[Inherit]: Structure.format,
	[Variant]: 'spawn',
	name: 'string',
	spawning: makeOptional(Spawning.format),
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
	spawning?: Spawning.Spawning;
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

	spawnCreep(body: any, name: string, options: SpawnCreepOptions = {}) {

		// Check name is valid and does not already exist
		if (typeof name !== 'string' || name === '' || typeof options !== 'object') {
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

		if (options.memory !== undefined) {
			const memory = Memory.get();
			(memory.creeps ?? (memory.creeps = {}))[name] = options.memory;
		}

		// TODO: fake creep object

		gameContext.intents.save(this, 'createCreep', { name, body, directions });
		return C.OK;
	}
}

export const interceptors = {
	...Spawning.interceptors,
	StructureSpawn: checkCast<Interceptor>()({
		overlay: StructureSpawn,
	}),
};

export const schemaFormat = { ...Spawning.schemaFormat, StructureSpawn: format };
