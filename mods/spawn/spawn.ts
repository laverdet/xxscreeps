import type { Room } from 'xxscreeps/game/room';
import * as C from 'xxscreeps/game/constants';
import * as Creep from 'xxscreeps/mods/creep/creep';
import * as Game from 'xxscreeps/game';
import * as Memory from 'xxscreeps/game/memory';
import * as Id from 'xxscreeps/engine/schema/id';
import * as Fn from 'xxscreeps/utility/functional';
import * as RoomObject from 'xxscreeps/game/object';
import * as Structure from 'xxscreeps/mods/structure/structure';
import * as Store from 'xxscreeps/mods/resource/store';
import { declare, compose, optional, struct, variant, vector, withOverlay } from 'xxscreeps/schema';
import { assign } from 'xxscreeps/utility/utility';
import { Direction, RoomPosition } from 'xxscreeps/game/position';
import { chainIntentChecks } from 'xxscreeps/game/checks';
import { registerBuildableStructure } from 'xxscreeps/mods/construction';
import { StructureExtension } from './extension';

type SpawnCreepOptions = {
	directions?: Direction[];
	dryRun?: boolean;
	energyStructures?: (StructureExtension | StructureSpawn)[];
	memory?: any;
};

export const format = () => compose(shape, StructureSpawn);
const shape = declare('Spawn', struct(Structure.format, {
	...variant('spawn'),
	name: 'string',
	spawning: optional(struct({
		creep: Id.format,
		directions: vector('int8'),
		endTime: 'int32',
		needTime: 'int32',
	})),
	store: Store.restrictedFormat<'energy'>(),
}));

export class StructureSpawn extends withOverlay(Structure.Structure, shape) {
	get energy() { return this.store[C.RESOURCE_ENERGY] }
	get energyCapacity() { return this.store.getCapacity(C.RESOURCE_ENERGY) }

	get memory() {
		const memory = Memory.get();
		const spawns = memory.spawns ?? (memory.spawns = {});
		return spawns[this.name] ?? (spawns[this.name] = {});
	}

	get structureType() { return C.STRUCTURE_SPAWN }
	[RoomObject.AddToMyGame](game: Game.Game) {
		game.spawns[this.name] = this;
	}
	[RoomObject.AfterInsert](room: Room) {
		super[RoomObject.AfterInsert](room);
		room.energyAvailable += this.store[C.RESOURCE_ENERGY];
		room.energyCapacityAvailable += this.store.getCapacity(C.RESOURCE_ENERGY);
	}
	[RoomObject.AfterRemove](room: Room) {
		super[RoomObject.AfterRemove](room);
		room.energyAvailable -= this.store[C.RESOURCE_ENERGY];
		room.energyCapacityAvailable -= this.store.getCapacity(C.RESOURCE_ENERGY);
	}

	canCreateCreep(body: any, name?: any) {
		// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
		return checkSpawnCreep(this, body, name ?? getUniqueName(name => Game.instance.creeps[name] !== undefined), null, null);
	}

	createCreep(body: any, name: any, memory: any) {
		return this.spawnCreep(
			body,
			// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
			name ?? getUniqueName(name => Game.instance.creeps[name] !== undefined),
			{ memory },
		);
	}

	isActive() {
		return true;
	}

	spawnCreep(body: Creep.PartType[], name: string, options: SpawnCreepOptions = {}) {
		const directions = options.directions ?? null;
		return chainIntentChecks(
			() => checkSpawnCreep(this, body, name, directions, options.energyStructures ?? null),
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
				const energyStructureIds = options.energyStructures?.map(structure => structure.id) ?? null;
				Game.intents.save(this as StructureSpawn, 'spawn', body, name, energyStructureIds, directions);

				// Fake creep
				const creep = Creep.create(this.pos, body, name, this.owner!);
				Game.instance.creeps[name] = creep;
				return C.OK;
			});
	}
}

export function create(pos: RoomPosition, owner: string, name: string) {
	return assign(RoomObject.create(new StructureSpawn, pos), {
		hits: C.SPAWN_HITS,
		name,
		store: Store.create(null, { energy: C.SPAWN_ENERGY_CAPACITY }, { energy: C.SPAWN_ENERGY_START }),
		[RoomObject.Owner]: owner,
	});
}

registerBuildableStructure(C.STRUCTURE_SPAWN, {
	obstacle: true,
	checkPlacement(room, pos) {
		return Structure.checkPlacement(room, pos) === C.OK ?
			C.CONSTRUCTION_COST.spawn : null;
	},
	create(site) {
		return create(site.pos, site.owner, site.name);
	},
});

//
// Intent checks
export function checkSpawnCreep(
	spawn: StructureSpawn,
	body: Creep.PartType[],
	name: string,
	directions: Direction[] | null,
	energyStructures: (StructureExtension | StructureSpawn)[] | null,
) {

	// Check name is valid and does not already exist
	if (typeof name !== 'string' || name === '') {
		return C.ERR_INVALID_ARGS;

	// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
	} else if (Game.instance.creeps[name] !== undefined) {
		return C.ERR_NAME_EXISTS;
	}

	// Check direction sanity
	if (directions !== null) {
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
	const creepCost = Fn.accumulate(body, part => C.BODYPART_COST[part]);
	if (energyStructures) {
		const totalEnergy = Fn.accumulate(new Set(energyStructures), structure => structure.energy);
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
