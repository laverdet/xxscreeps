import * as C from '~/game/constants';
import { gameContext } from '~/game/context';
import { getPositonInDirection, Direction, RoomPosition } from '~/game/position';
import * as Creep from '~/game/objects/creep';
import { bindProcessor } from '~/engine/processor/bind';
import { RoomObject } from '~/game/objects/room-object';
import { StructureExtension } from '~/game/objects/structures/extension';
import { checkSpawnCreep, StructureSpawn } from '~/game/objects/structures/spawn';
import { accumulate, instantiate } from '~/lib/utility';
import * as CreepIntent from './creep';
import * as RoomIntent from './room';
import { newRoomObject } from './room-object';
import * as StoreIntent from './store';

type Parameters = {
	spawn: {
		body: C.BodyPart[];
		name: string;
		energyStructures?: string[];
		directions?: Direction[];
	};
};

export type Intents = {
	receiver: StructureSpawn;
	parameters: Parameters;
};

export function create(pos: RoomPosition, owner: string, name: string) {
	return instantiate(StructureSpawn, {
		...newRoomObject(pos),
		hits: C.SPAWN_HITS,
		name,
		store: StoreIntent.create(null, { energy: C.SPAWN_ENERGY_CAPACITY }, { energy: C.SPAWN_ENERGY_START }),
		spawning: undefined,
		_owner: owner,
	});
}

function createCreep(spawn: StructureSpawn, intent: Parameters['spawn']) {

	// Is this intent valid?
	const { body, directions, energyStructures: energyStructureIds, name } = intent;
	const canBuild = checkSpawnCreep(spawn, body, name, directions) === C.OK;
	if (!canBuild) {
		return false;
	}

	// Get energy structures
	let cost = accumulate(intent.body, part => C.BODYPART_COST[part]);
	const energyStructures = function() {
		const filter = (structure?: RoomObject): structure is StructureExtension | StructureSpawn =>
			structure instanceof StructureExtension || structure instanceof StructureSpawn;
		if (energyStructureIds) {
			return energyStructureIds.map(id => Game.getObjectById(id)).filter(filter);
		} else {
			const structures = spawn.room.find(C.FIND_STRUCTURES).filter(filter);
			return structures.sort((left, right) =>
				// eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
				(left.structureType === 'extension' ? 1 : 0) - (right.structureType === 'extension' ? 1 : 0) ||
				left.pos.getRangeTo(spawn.pos) - right.pos.getRangeTo(spawn.pos));
		}
	}();

	// Withdraw energy
	for (const structure of energyStructures) {
		const energyToSpend = Math.min(cost, structure.energy);
		if (StoreIntent.subtract(structure.store, 'energy', energyToSpend)) {
			cost -= energyToSpend;
			if (cost === 0) {
				break;
			}
		}
	}

	// Add new creep to room objects
	const creep = CreepIntent.create(intent.body, spawn.pos, intent.name, gameContext.userId);
	RoomIntent.insertObject(spawn.room, creep);

	// Set spawning information
	const needTime = intent.body.length * C.CREEP_SPAWN_TIME;
	spawn.spawning = {
		creep: creep.id,
		directions: intent.directions ?? [],
		endTime: Game.time + needTime,
		needTime,
	};

	return true;
}

export default () => bindProcessor(StructureSpawn, {
	process(intents: Partial<Parameters>) {
		if (intents.spawn) {
			return createCreep(this, intents.spawn);
		}

		return false;
	},

	tick() {
		if (this.spawning && this.spawning.endTime <= Game.time) {
			const creep = Game.getObjectById(this.spawning.creep);
			if (creep && creep instanceof Creep.Creep) {
				const hasClaim = creep.body.some(part => part.type === 'claim');
				creep._ageTime = Game.time + (hasClaim ? C.CREEP_CLAIM_LIFE_TIME : C.CREEP_LIFE_TIME);
				creep.pos = getPositonInDirection(creep.pos, C.TOP);
			}
			this.spawning = undefined;
		}

		if (this.room.energyAvailable < C.SPAWN_ENERGY_CAPACITY && this.store.energy < C.SPAWN_ENERGY_CAPACITY) {
			StoreIntent.add(this.store, 'energy', 1);
		}
		return false;
	},
});
