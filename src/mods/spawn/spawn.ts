import type { PartType } from 'xxscreeps/mods/creep/creep';
import type { GameConstructor } from 'xxscreeps/game';
import type { Direction, RoomPosition } from 'xxscreeps/game/position';
import type { Room } from 'xxscreeps/game/room';
import type { StructureExtension } from './extension';
import * as C from 'xxscreeps/game/constants';
import * as Memory from 'xxscreeps/mods/memory/memory';
import * as Id from 'xxscreeps/engine/schema/id';
import * as Fn from 'xxscreeps/utility/functional';
import * as RoomObject from 'xxscreeps/game/object';
import { Creep, checkCommon, create as createCreep } from 'xxscreeps/mods/creep/creep';
import { Game, intents, userGame } from 'xxscreeps/game';
import { OwnedStructure, checkMyStructure, checkPlacement, ownedStructureFormat } from 'xxscreeps/mods/structure/structure';
import { SingleStore, singleStoreFormat } from 'xxscreeps/mods/resource/store';
import { compose, declare, optional, struct, variant, vector, withOverlay } from 'xxscreeps/schema';
import { assign } from 'xxscreeps/utility/utility';
import { chainIntentChecks, checkRange, checkTarget } from 'xxscreeps/game/checks';
import { registerBuildableStructure } from 'xxscreeps/mods/construction';
import { BufferObject } from 'xxscreeps/schema/buffer-object';

type SpawnCreepOptions = {
	directions?: Direction[];
	dryRun?: boolean;
	energyStructures?: (StructureExtension | StructureSpawn)[];
	memory?: any;
};

// `StructureSpawn.Spawning` format and definition
const spawningFormat = struct({
	directions: vector('int8'),
	needTime: 'int32',
	'#spawnId': Id.format,
	'#spawningCreepId': Id.format,
	'#spawnTime': 'int32',
});

class Spawning extends withOverlay(BufferObject, spawningFormat) {
	@enumerable get name() { return Game.getObjectById<Creep>(this['#spawningCreepId'])!.name }
	@enumerable get remainingTime() { return Math.max(0, this['#spawnTime'] - Game.time) }
	@enumerable get spawn() { return Game.getObjectById<StructureSpawn>(this['#spawnId'])! }
}

// `StructureSpawn` format
export const format = declare('Spawn', () => compose(shape, StructureSpawn));
const shape = struct(ownedStructureFormat, {
	...variant('spawn'),
	hits: 'int32',
	name: 'string',
	spawning: optional(compose(spawningFormat, Spawning)),
	store: singleStoreFormat(),
});

export class StructureSpawn extends withOverlay(OwnedStructure, shape) {
	static readonly Spawning = Spawning;

	get energy() { return this.store[C.RESOURCE_ENERGY] }
	get energyCapacity() { return this.store.getCapacity(C.RESOURCE_ENERGY) }
	override get hitsMax() { return C.SPAWN_HITS }
	override get structureType() { return C.STRUCTURE_SPAWN }

	get memory() {
		const memory = Memory.get();
		const spawns = memory.spawns ??= {};
		return spawns[this.name] ??= {};
	}

	override ['#addToMyGame'](game: GameConstructor) {
		game.spawns[this.name] = this;
	}

	override ['#afterInsert'](room: Room) {
		super['#afterInsert'](room);
		room.energyAvailable += this.store[C.RESOURCE_ENERGY];
		room.energyCapacityAvailable += this.store.getCapacity(C.RESOURCE_ENERGY);
	}

	override ['#afterRemove'](room: Room) {
		super['#afterRemove'](room);
		room.energyAvailable -= this.store[C.RESOURCE_ENERGY];
		room.energyCapacityAvailable -= this.store.getCapacity(C.RESOURCE_ENERGY);
	}

	override isActive() {
		return true;
	}

	/**
	 * Check if a creep can be created.
	 * @deprecated
	 */
	canCreateCreep(body: any, name?: any) {
		return checkSpawnCreep(this, body, name ?? getUniqueName(name => userGame?.creeps[name] !== undefined), null, null);
	}

	/**
	 * Start the creep spawning process. The required energy amount can be withdrawn from all spawns and extensions in the room.
	 * @deprecated
	 */
	createCreep(body: any, name: any, memory?: any) {
		const result = this.spawnCreep(
			body,
			name ?? getUniqueName(name => userGame?.creeps[name] !== undefined),
			{ memory },
		);
		return result === C.OK ? name : result;
	}

	/**
	 * Kill the creep and drop up to 100% of resources spent on its spawning and boosting depending on
	 * remaining life time. The target should be at adjacent square. Energy return is limited to 125
	 * units per body part.
	 * @param creep The target creep object.
	 */
	recycleCreep(creep: Creep) {
		chainIntentChecks(
			() => checkRecycleCreep(this, creep),
			() => intents.save(this, 'recycleCreep', creep.id));
	}

	/**
	 * Start the creep spawning process. The required energy amount can be withdrawn from all spawns
	 * and extensions in the room.
   * @param body An array describing the new creep’s body. Should contain 1 to 50 elements with one
	 * of these constants: `WORK`, `MOVE`, `CARRY`, `ATTACK`, `RANGED_ATTACK`, `HEAL`, `CLAIM`.
	 * @param name The name of a new creep. The name length limit is 100 characters. It must be a
	 * unique creep name, i.e. the `Game.creeps` object should not contain another creep with the same
	 * name (hash key).
	 * @param options An object with additional options for the spawning process. `memory` - Memory of
	 *   the new creep. If provided, it will be immediately stored into `Memory.creeps[name]`
	 *   `energyStructures` - Array of spawns/extensions from which to draw energy for the spawning
	 *   process. Structures will be used according to the array order. `dryRun` - If `dryRun` is
	 *   true, the operation will only check if it is possible to create a creep. `directions` - Set
	 *   desired directions where the creep should move when spawned. An array with the direction
	 *   constants: `TOP`, `TOP_RIGHT`, `RIGHT`, `BOTTOM_RIGHT`, `BOTTOM`, `BOTTOM_LEFT`, `LEFT`,
	 *   `TOP_LEFT`
	 */
	spawnCreep(body: PartType[], name: string, options: SpawnCreepOptions = {}) {
		const directions = options.directions ?? null;
		return chainIntentChecks(
			() => checkSpawnCreep(this, body, name, directions, options.energyStructures ?? null),
			() => {
				if (options.dryRun) {
					return C.OK;
				}

				// Save memory option to Memory
				if (options.memory !== undefined) {
					const memory = Memory.get();
					(memory.creeps ?? (memory.creeps = {}))[name] = options.memory;
				}

				// Save intent
				const energyStructureIds = options.energyStructures?.map(structure => structure.id) ?? null;
				intents.save(this as StructureSpawn, 'spawn', body, name, energyStructureIds, directions);

				// Fake creep
				const creep = createCreep(this.pos, body, name, this['#user']!);
				creep.room = this.room;
				userGame!.creeps[name] = creep;
				return C.OK;
			});
	}
}

export function create(pos: RoomPosition, owner: string, name: string) {
	const spawn = assign(RoomObject.create(new StructureSpawn, pos), {
		hits: C.SPAWN_HITS,
		name,
		store: SingleStore['#create'](C.RESOURCE_ENERGY, C.SPAWN_ENERGY_CAPACITY, C.SPAWN_ENERGY_START),
	});
	spawn['#user'] = owner;
	return spawn;
}

registerBuildableStructure(C.STRUCTURE_SPAWN, {
	obstacle: true,
	checkPlacement(room, pos) {
		return checkPlacement(room, pos) === C.OK ?
			C.CONSTRUCTION_COST.spawn : null;
	},
	create(site) {
		return create(site.pos, site['#user'], site.name);
	},
});

//
// Intent checks
export function checkRecycleCreep(spawn: StructureSpawn, creep: Creep) {
	return chainIntentChecks(
		() => checkMyStructure(spawn, StructureSpawn),
		() => checkCommon(creep),
		() => checkTarget(creep, Creep),
		() => checkRange(spawn, creep, 1));
}

export function checkSpawnCreep(
	spawn: StructureSpawn,
	body: PartType[],
	name: string,
	directions: Direction[] | null,
	energyStructures: (StructureExtension | StructureSpawn)[] | null,
) {

	// Check name is valid and does not already exist
	if (typeof name !== 'string' || name === '') {
		return C.ERR_INVALID_ARGS;

	// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
	} else if (userGame?.creeps[name] !== undefined) {
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
