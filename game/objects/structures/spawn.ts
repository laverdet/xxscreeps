import * as C from '~/game/constants';
import * as Game from '~/game/game';
import * as Memory from '~/game/memory';
import type { shape } from '~/engine/schema/spawn';
import { withOverlay } from '~/lib/schema';
import { accumulate } from '~/lib/utility';

import { Direction } from '~/game/position';
import type { PartType } from '~/game/objects/creep';
import { create as createCreep } from '~/engine/processor/intents/creep';
import { chainIntentChecks } from '../room-object';
import { StructureExtension } from './extension';
import { Structure } from '.';

type SpawnCreepOptions = {
	directions?: Direction[];
	dryRun?: boolean;
	energyStructures?: (StructureExtension | StructureSpawn)[];
	memory?: any;
};

export class StructureSpawn extends withOverlay<typeof shape>()(Structure) {
	get energy() { return this.store[C.RESOURCE_ENERGY] }
	get energyCapacity() { return this.store.getCapacity(C.RESOURCE_ENERGY) }

	get memory() {
		const memory = Memory.get();
		const spawns = memory.spawns ?? (memory.spawns = {});
		return spawns[this.name] ?? (spawns[this.name] = {});
	}

	get structureType() { return C.STRUCTURE_SPAWN }

	canCreateCreep(body: any, name?: any) {
		return checkSpawnCreep(this, body, name ?? getUniqueName(name => Game.creeps[name] !== undefined));
	}

	createCreep(body: any, name: any, memory: any) {
		return this.spawnCreep(
			body,
			name ?? getUniqueName(name => Game.creeps[name] !== undefined),
			{ memory },
		);
	}

	isActive() {
		return true;
	}

	spawnCreep(body: PartType[], name: string, options: SpawnCreepOptions = {}) {
		return chainIntentChecks(
			() => checkSpawnCreep(this, body, name, options.directions, options.energyStructures),
			() => {
				if (options.dryRun == true) {
					return C.OK;
				}

				// Save memory option to Memory
				if (options.memory !== undefined) {
					const memory = Memory.get();
					(memory.creeps ?? (memory.creeps = {}))[name] = options.memory;
				}

				// Save intent
				Game.intents.save(this, 'spawn', {
					name,
					body,
					directions: options.directions,
					energyStructures: options.energyStructures?.map(structure => structure.id),
				});

				// Fake creep
				const creep = createCreep(body, this.pos, name, this._owner!);
				Game.creeps[name] = creep;
				return C.OK;
			});
	}
}

//
// Intent checks
export function checkSpawnCreep(
	spawn: StructureSpawn,
	body: PartType[],
	name: string,
	directions?: Direction[],
	energyStructures?: (StructureExtension | StructureSpawn)[],
) {

	// Check name is valid and does not already exist
	if (typeof name !== 'string' || name === '') {
		return C.ERR_INVALID_ARGS;

	} else if (Game.creeps[name] !== undefined) {
		return C.ERR_NAME_EXISTS;
	}

	// Check direction sanity
	if (directions !== undefined) {
		if (!Array.isArray(directions)) {
			return C.ERR_INVALID_ARGS;
		}
		// Bail if out of range
		if (directions.length === 0 || directions.some(dir => !Number.isInteger(dir) || dir < 1 || dir > 8)) {
			return C.ERR_INVALID_ARGS;
		}
	}

	if (!spawn.my) {
		return C.ERR_NOT_OWNER;
	} else if (spawn.spawning) {
		return C.ERR_BUSY;
	}

	// TODO: RCL

	if (!Array.isArray(body) || body.length === 0 || body.length > C.MAX_CREEP_SIZE) {
		return C.ERR_INVALID_ARGS;

	} else if (!body.every(part => C.BODYPARTS_ALL.includes(part))) {
		return C.ERR_INVALID_ARGS;
	}

	// Check body cost
	const creepCost = accumulate(body, part => C.BODYPART_COST[part]);
	if (energyStructures) {
		const totalEnergy = accumulate(new Set(energyStructures), structure => structure.energy);
		if (totalEnergy < creepCost) {
			return C.ERR_NOT_ENOUGH_ENERGY;
		}
	} else if (spawn.room.energyAvailable < creepCost) {
		return C.ERR_NOT_ENOUGH_ENERGY;
	}

	return C.OK;
}

//
// Helpers
const names = [
	'Aaliyah', 'Aaron', 'Abigail', 'Adalyn', 'Adam', 'Addison', 'Adeline', 'Adrian', 'Aiden',
	'Alaina', 'Alex', 'Alexander', 'Alexandra', 'Alexis', 'Alice', 'Allison', 'Alyssa', 'Amelia',
	'Andrew', 'Anna', 'Annabelle', 'Anthony', 'Aria', 'Arianna', 'Asher', 'Aubrey', 'Audrey',
	'Austin', 'Ava', 'Avery', 'Bailey', 'Bella', 'Benjamin', 'Bentley', 'Blake', 'Brayden', 'Brody',
	'Brooklyn', 'Caden', 'Caleb', 'Callie', 'Camden', 'Cameron', 'Camilla', 'Caroline', 'Carson',
	'Carter', 'Charlie', 'Charlotte', 'Chase', 'Chloe', 'Christian', 'Christopher', 'Claire', 'Cole',
	'Colin', 'Colton', 'Connor', 'Cooper', 'Daniel', 'David', 'Declan', 'Dominic', 'Dylan', 'Elena',
	'Eli', 'Eliana', 'Elijah', 'Elizabeth', 'Ella', 'Ellie', 'Elliot', 'Emily', 'Emma', 'Ethan',
	'Eva', 'Evan', 'Evelyn', 'Gabriel', 'Gabriella', 'Gavin', 'Gianna', 'Grace', 'Grayson', 'Hailey',
	'Hannah', 'Harper', 'Henry', 'Hudson', 'Hunter', 'Ian', 'Isaac', 'Isabella', 'Isabelle', 'Isaiah',
	'Jack', 'Jackson', 'Jacob', 'Jake', 'James', 'Jasmine', 'Jason', 'Jayce', 'Jayden', 'Jeremiah',
	'John', 'Jonathan', 'Jordan', 'Jordyn', 'Joseph', 'Joshua', 'Josiah', 'Julia', 'Julian',
	'Juliana', 'Kaelyn', 'Kaitlyn', 'Katherine', 'Kayla', 'Kaylee', 'Keira', 'Kennedy', 'Kylie',
	'Landon', 'Lauren', 'Layla', 'Leah', 'Leo', 'Levi', 'Liam', 'Lila', 'Liliana', 'Lillian', 'Lily',
	'Lincoln', 'Logan', 'London', 'Lucas', 'Lucy', 'Luke', 'Mackenzie', 'Madelyn', 'Madison',
	'Makayla', 'Maria', 'Mason', 'Mateo', 'Matthew', 'Max', 'Maya', 'Mia', 'Micah', 'Michael', 'Mila',
	'Miles', 'Molly', 'Muhammad', 'Natalie', 'Nathan', 'Nathaniel', 'Nicholas', 'Noah', 'Nolan',
	'Nora', 'Oliver', 'Olivia', 'Owen', 'Parker', 'Penelope', 'Peyton', 'Reagan', 'Riley', 'Ruby',
	'Ryan', 'Sadie', 'Samantha', 'Samuel', 'Sarah', 'Savannah', 'Scarlett', 'Sebastian', 'Skyler',
	'Sophia', 'Sophie', 'Stella', 'Sydney', 'Taylor', 'Thomas', 'Tristan', 'Tyler', 'Victoria',
	'Violet', 'Vivian', 'William', 'Wyatt', 'Xavier', 'Zachary', 'Zoe',
];

function getUniqueName(exists: (name: string) => boolean) {
	let ii = 0;
	do {
		let name = names[Math.floor(Math.random() * names.length)];
		if (++ii > 4) {
			name += names[Math.floor(Math.random() * names.length)];
		}
		if (!exists(name)) {
			return name;
		}
	} while (true);
}
