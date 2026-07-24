import type { StructureExtension } from './extension.js';
import type { GameConstructor } from 'xxscreeps/game/index.js';
import type { Direction, RoomPosition } from 'xxscreeps/game/position.js';
import type { PartType } from 'xxscreeps/mods/classic/creep/creep.js';
import { Fn } from 'xxscreeps/functional/fn.js';
import { chainIntentChecks, checkRange, checkString, checkTarget } from 'xxscreeps/game/checks.js';
import { Game, intents, userGame } from 'xxscreeps/game/index.js';
import { createRoomObject, requiredExpiryTime } from 'xxscreeps/game/object.js';
import { registerBuildableStructure } from 'xxscreeps/mods/classic/construction/game.js';
import { Creep, calculateCost, checkCommon, create as createCreep } from 'xxscreeps/mods/classic/creep/creep.js';
import { SingleStore } from 'xxscreeps/mods/classic/resource/store.js';
import { OwnedStructure, checkIsActive, checkMyStructure, checkPlacement, lookForStructures } from 'xxscreeps/mods/classic/structure/structure.js';
import * as Memory from 'xxscreeps/mods/meta/memory/memory.js';
import { BufferObject } from 'xxscreeps/schema/buffer-object.js';
import { withOverlay } from 'xxscreeps/schema/index.js';
import { assign } from 'xxscreeps/utility/utility.js';
import * as C from 'xxscreeps:mods/constants';
import { bindSpawningFormat, spawnShape, spawningShape } from './schema.js';

interface SpawnCreepOptions {
	directions?: Direction[];
	dryRun?: boolean;
	energyStructures?: (StructureExtension | StructureSpawn)[];
	memory?: unknown;
}

/**
 * Details of the creep being spawned currently that can be addressed by the
 * [`StructureSpawn.spawning`](https://docs.screeps.com/api/#StructureSpawn.spawning) property.
 * @public
 * @see https://docs.screeps.com/api/#StructureSpawn-Spawning
 */
export class Spawning extends withOverlay(BufferObject, spawningShape) {
	/**
	 * The name of a new creep.
	 * @public
	 * @see https://docs.screeps.com/api/#StructureSpawn.Spawning.name
	 */
	@enumerable get name() { return Game.getObjectById<Creep>(this['#spawningCreepId'])!.name; }

	/**
	 * Remaining time to go.
	 * @public
	 * @see https://docs.screeps.com/api/#StructureSpawn.Spawning.remainingTime
	 */
	@enumerable get remainingTime() { return requiredExpiryTime(this['#spawnTime']); }

	/**
	 * A link to the spawn.
	 * @public
	 * @see https://docs.screeps.com/api/#StructureSpawn.Spawning.spawn
	 */
	@enumerable get spawn() { return Game.getObjectById<StructureSpawn>(this['#spawnId'])!; }

	/**
	 * Cancel spawning immediately. Energy spent on spawning is not returned.
	 * @public
	 * @see https://docs.screeps.com/api/#StructureSpawn.Spawning.cancel
	 */
	cancel() {
		chainIntentChecks(
			() => checkMyStructure(this.spawn, StructureSpawn),
			() => intents.save(this.spawn, 'cancelSpawning'));
	}

	/**
	 * Set desired directions where the creep should move when spawned.
	 * @param directions An array with the direction constants: `TOP`, `TOP_RIGHT`, `RIGHT`,
	 * `BOTTOM_RIGHT`, `BOTTOM`, `BOTTOM_LEFT`, `LEFT`, `TOP_LEFT`.
	 * @public
	 * @see https://docs.screeps.com/api/#StructureSpawn.Spawning.setDirections
	 */
	setDirections(directions: Direction[]) {
		chainIntentChecks(
			() => checkMyStructure(this.spawn, StructureSpawn),
			() => checkDirections(directions) ? C.OK : C.ERR_INVALID_ARGS,
			() => intents.save(this.spawn, 'setSpawnDirections', directions));
	}
}

bindSpawningFormat(Spawning);

/**
 * Spawn is your colony center. This structure can create, renew, and recycle creeps. All your
 * spawns are accessible through [`Game.spawns`](https://docs.screeps.com/api/#Game.spawns) hash
 * list. Spawns auto-regenerate a little amount of energy each tick, so that you can easily recover
 * even if all your creeps died.
 * @public
 * @see https://docs.screeps.com/api/#StructureSpawn
 */
export class StructureSpawn extends withOverlay(OwnedStructure, spawnShape) {
	static readonly Spawning = Spawning;

	/**
	 * An alias for `.store[RESOURCE_ENERGY]`.
	 * @public
	 * @deprecated
	 * @see https://docs.screeps.com/api/#StructureSpawn.energy
	 */
	get energy() { return this.store[C.RESOURCE_ENERGY]; }

	/**
	 * An alias for `.store.getCapacity(RESOURCE_ENERGY)`.
	 * @public
	 * @deprecated
	 * @see https://docs.screeps.com/api/#StructureSpawn.energyCapacity
	 */
	get energyCapacity() { return this.store.getCapacity(C.RESOURCE_ENERGY); }

	/**
	 * The total amount of hit points of the structure.
	 * @public
	 * @see https://docs.screeps.com/api/#StructureSpawn.hitsMax
	 */
	override get hitsMax() { return C.SPAWN_HITS; }

	/**
	 * One of the `STRUCTURE_*` constants.
	 * @public
	 * @see https://docs.screeps.com/api/#StructureSpawn.structureType
	 */
	override get structureType() { return C.STRUCTURE_SPAWN; }

	/**
	 * A shorthand to `Memory.spawns[spawn.name]`. You can use it for quick access the spawn's
	 * specific memory data object.
	 * [Learn more about memory](https://docs.screeps.com/global-objects.html#Memory-object)
	 * @public
	 * @see https://docs.screeps.com/api/#StructureSpawn.memory
	 */
	get memory() {
		if (!this.my) {
			// @ts-expect-error
			return;
		}
		return (Memory.get().spawns ??= {})[this.name] ??= {};
	}

	set memory(memory: Record<string, unknown>) {
		if (!this.my) {
			return;
		}
		(Memory.get().spawns ??= {})[this.name] ??= memory;
	}

	override '#addToMyGame'(game: GameConstructor) {
		super['#addToMyGame'](game);
		game.spawns[this.name] = this;
	}

	override '#afterRemove'() {
		const { spawning } = this;
		if (spawning) {
			const creep = Game.getObjectById(spawning['#spawningCreepId'])!;
			if (creep.room as unknown) {
				creep.room['#removeObject'](creep);
			}
		}
		super['#afterRemove']();
	}

	override '#applyNukeImpact'() {
		this.spawning = null;
	}

	/**
	 * Check if a creep can be created.
	 * @param body An array describing the new creep's body. Should contain 1 to 50 elements with one
	 * of these constants: `WORK`, `MOVE`, `CARRY`, `ATTACK`, `RANGED_ATTACK`, `HEAL`, `TOUGH`,
	 * `CLAIM`.
	 * @param name The name of a new creep. The name length limit is 100 characters. It should be
	 * unique creep name, i.e. the `Game.creeps` object should not contain another creep with the same
	 * name (hash key). If not defined, a random name will be generated.
	 * @returns One of the following codes: `OK`, `ERR_NOT_OWNER`, `ERR_NAME_EXISTS`, `ERR_BUSY`,
	 * `ERR_NOT_ENOUGH_ENERGY`, `ERR_INVALID_ARGS`, `ERR_RCL_NOT_ENOUGH`
	 * @public
	 * @deprecated Please use
	 * [`StructureSpawn.spawnCreep`](https://docs.screeps.com/api/#StructureSpawn.spawnCreep) with
	 * `dryRun` flag instead.
	 * @see https://docs.screeps.com/api/#StructureSpawn.canCreateCreep
	 */
	canCreateCreep(body: PartType[], name?: string) {
		return checkSpawnCreep(this, body, name ?? `${Math.random()}`, null, null);
	}

	/**
	 * Start the creep spawning process. The required energy amount can be withdrawn from all spawns
	 * and extensions in the room.
	 * @param body An array describing the new creep's body. Should contain 1 to 50 elements with one
	 * of these constants: `WORK`, `MOVE`, `CARRY`, `ATTACK`, `RANGED_ATTACK`, `HEAL`, `TOUGH`,
	 * `CLAIM`.
	 * @param name The name of a new creep. The name length limit is 100 characters. It should be
	 * unique creep name, i.e. the `Game.creeps` object should not contain another creep with the same
	 * name (hash key). If not defined, a random name will be generated.
	 * @param memory The memory of a new creep. If provided, it will be immediately stored into
	 * `Memory.creeps[name]`.
	 * @returns The name of a new creep or one of these error codes: `ERR_NOT_OWNER`,
	 * `ERR_NAME_EXISTS`, `ERR_BUSY`, `ERR_NOT_ENOUGH_ENERGY`, `ERR_INVALID_ARGS`,
	 * `ERR_RCL_NOT_ENOUGH`
	 * @public
	 * @deprecated Please use
	 * [`StructureSpawn.spawnCreep`](https://docs.screeps.com/api/#StructureSpawn.spawnCreep) instead.
	 * @see https://docs.screeps.com/api/#StructureSpawn.createCreep
	 */
	createCreep(body: PartType[], name: string, memory?: object): Exclude<ReturnType<typeof checkSpawnCreep>, typeof C.OK> | string;
	createCreep(body: PartType[], memory?: object): Exclude<ReturnType<typeof checkSpawnCreep>, typeof C.OK> | string;
	createCreep(body: PartType[], ...args: unknown[]) {
		const [ name, memory ] = function() {
			const [ first, second ] = args;
			if (typeof first === 'object' && second === undefined) {
				return [ undefined, first ];
			} else {
				return [ first as string, second ];
			}
		}();
		const intentName = name ?? getUniqueName(name => userGame?.creeps[name] !== undefined);
		const result = this.spawnCreep(body, intentName, { memory });
		return result === C.OK ? intentName : result;
	}

	/**
	 * Kill the creep and drop up to 100% of resources spent on its spawning and boosting depending on
	 * remaining life time. The target should be at adjacent square. Energy return is limited to 125
	 * units per body part.
	 * @param creep The target creep object.
	 * @returns One of the following codes: `OK`, `ERR_NOT_OWNER`, `ERR_INVALID_TARGET`,
	 * `ERR_NOT_IN_RANGE`, `ERR_RCL_NOT_ENOUGH`
	 * @public
	 * @see https://docs.screeps.com/api/#StructureSpawn.recycleCreep
	 */
	recycleCreep(creep: Creep) {
		return chainIntentChecks(
			() => checkRecycleCreep(this, creep),
			() => intents.save(this, 'recycleCreep', creep.id));
	}

	/**
	 * Increase the remaining time to live of the target creep. The target should be at adjacent
	 * square. The target should not have CLAIM body parts. The spawn should not be busy with the
	 * spawning process. Each execution increases the creep's timer by amount of ticks according to
	 * this formula: `floor(600/body_size)`. Energy required for each execution is determined using
	 * this formula: `ceil(creep_cost/2.5/body_size)`.
	 *
	 * Renewing a creep removes all of its boosts.
	 * @param creep The target creep object.
	 * @returns One of the following codes: `OK`, `ERR_NOT_OWNER`, `ERR_BUSY`,
	 * `ERR_NOT_ENOUGH_ENERGY`, `ERR_INVALID_TARGET`, `ERR_FULL`, `ERR_NOT_IN_RANGE`,
	 * `ERR_RCL_NOT_ENOUGH`
	 * @public
	 * @see https://docs.screeps.com/api/#StructureSpawn.renewCreep
	 */
	renewCreep(creep: Creep) {
		return chainIntentChecks(
			() => checkRenewCreep(this, creep),
			() => intents.save(this, 'renewCreep', creep.id));
	}

	/**
	 * Start the creep spawning process. The required energy amount can be withdrawn from all spawns
	 * and extensions in the room.
	 * @param body An array describing the new creep's body. Should contain 1 to 50 elements with one
	 * of these constants: `WORK`, `MOVE`, `CARRY`, `ATTACK`, `RANGED_ATTACK`, `HEAL`, `TOUGH`,
	 * `CLAIM`.
	 * @param name The name of a new creep. The name length limit is 100 characters. It must be a
	 * unique creep name, i.e. the `Game.creeps` object should not contain another creep with the same
	 * name (hash key).
	 * @param options An object with additional options for the spawning process. `memory` - Memory of
	 * the new creep. If provided, it will be immediately stored into `Memory.creeps[name]`.
	 * `energyStructures` - Array of spawns/extensions from which to draw energy for the spawning
	 * process. Structures will be used according to the array order. `dryRun` - If `dryRun` is true,
	 * the operation will only check if it is possible to create a creep. `directions` - Set desired
	 * directions where the creep should move when spawned. An array with the direction constants:
	 * `TOP`, `TOP_RIGHT`, `RIGHT`, `BOTTOM_RIGHT`, `BOTTOM`, `BOTTOM_LEFT`, `LEFT`, `TOP_LEFT`.
	 * @returns One of the following codes: `OK`, `ERR_NOT_OWNER`, `ERR_NAME_EXISTS`, `ERR_BUSY`,
	 * `ERR_NOT_ENOUGH_ENERGY`, `ERR_INVALID_ARGS`, `ERR_RCL_NOT_ENOUGH`
	 * @public
	 * @see https://docs.screeps.com/api/#StructureSpawn.spawnCreep
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
				const memory = Memory.get();
				// eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
				if (memory.creeps === undefined) {
					memory.creeps = {};
				}
				// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
				if (memory.creeps != null && typeof memory.creeps === 'object') {
					memory.creeps[name] = options.memory as never;
				}

				// Save intent
				const energyStructureIds = options.energyStructures?.map(structure => structure.id) ?? null;
				intents.save(this, 'spawn', body, name, energyStructureIds, directions);

				// Fake creep
				const creep = createCreep(this.pos, body, name, this['#user']!);
				creep.room = this.room;
				// Spawning this tick; the processor assigns the real age
				creep['#ageTime'] = 0;
				userGame!.creeps[name] = creep;
				return C.OK;
			});
	}
}

export function create(pos: RoomPosition, owner: string, name: string) {
	const spawn = assign(createRoomObject(new StructureSpawn(), pos), {
		hits: C.SPAWN_HITS,
		name,
		store: SingleStore['#create'](C.RESOURCE_ENERGY, C.SPAWN_ENERGY_CAPACITY, C.SPAWN_ENERGY_START),
	});
	spawn['#user'] = owner;
	return spawn;
}

function hasSpawn(userGame: GameConstructor, name: string) {
	return Boolean(
		userGame.spawns[name] ??
		Object.values(userGame.constructionSites).some(site => site.name === name));
}

registerBuildableStructure(C.STRUCTURE_SPAWN, {
	obstacle: true,
	checkName(room, name) {
		if (name != null) {
			if (checkString(name, 100, true) !== C.OK) {
				return null;
			}
			if (userGame) {
				// In the player runtime
				if (hasSpawn(userGame, name)) {
					return null;
				} else {
					return name;
				}
			} else {
				// Just check the current room for name collision
				return lookForStructures(room, C.STRUCTURE_SPAWN).some(spawn => spawn.my && spawn.name === name)
					? null : name;
			}
		} else if (userGame) {
			// Generate a new name
			for (let ii = 1; ; ++ii) {
				const name = `Spawn${ii}`;
				if (!hasSpawn(userGame, name)) {
					return name;
				}
			}
		} else {
			return null;
		}
	},
	checkPlacement(room, pos) {
		return checkPlacement(room, pos) === C.OK
			? C.CONSTRUCTION_COST.spawn : null;
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
		() => checkIsActive(spawn),
		() => checkTarget(creep, Creep),
		() => checkCommon(creep),
		() => checkRange(spawn, creep, 1));
}

export function checkRenewCreep(spawn: StructureSpawn, creep: Creep) {
	return chainIntentChecks(
		() => checkSpawnType(spawn),
		() => spawn.spawning ? C.ERR_BUSY : C.OK,
		() => checkTarget(creep, Creep),
		() => checkSpawnOwner(spawn),
		() => checkIsActive(spawn),
		() => checkCommon(creep),
		() => checkRange(spawn, creep, 1),
		() => {
			if (spawn.room.energyAvailable < calculateRenewCost(creep)) {
				return C.ERR_NOT_ENOUGH_RESOURCES;
			} else if (creep.body.some(bodyPart => bodyPart.type === C.CLAIM)) {
				return C.ERR_NO_BODYPART;
			} else if (creep.ticksToLive! + calculateRenewAmount(creep) > C.CREEP_LIFE_TIME) {
				return C.ERR_FULL;
			}
		});
}

export function checkDirections(directions: Direction[] | null) {
	return (
		Array.isArray(directions) &&
		directions.length > 0 &&
		directions.length <= 8 &&
		directions.every(dir => Number.isInteger(dir) && dir >= 1 && dir <= 8)
	);
}

function checkSpawnType(spawn: StructureSpawn) {
	return spawn instanceof StructureSpawn ? C.OK : C.ERR_INVALID_ARGS;
}

function checkSpawnOwner(spawn: StructureSpawn) {
	return spawn.my ? C.OK : C.ERR_NOT_OWNER;
}

export function checkSpawnCreep(
	spawn: StructureSpawn,
	body: PartType[],
	name: string,
	directions: Direction[] | null,
	energyStructures: (StructureExtension | StructureSpawn)[] | null,
) {
	return chainIntentChecks(
		() => checkSpawnType(spawn),
		() => checkString(name, 100, true),
		() => {
			if (userGame?.creeps[name] !== undefined) {
				return C.ERR_NAME_EXISTS;
			}
			if (directions !== null && !checkDirections(directions)) {
				return C.ERR_INVALID_ARGS;
			}
		},
		() => checkSpawnOwner(spawn),
		() => {
			if (spawn.spawning) {
				return C.ERR_BUSY;
			}
		},
		() => checkIsActive(spawn),
		() => {
			if (
				!Array.isArray(body) ||
				body.length === 0 ||
				body.length > C.MAX_CREEP_SIZE ||
				!body.every(part => C.BODYPARTS_ALL.includes(part))
			) {
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
		});
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
		let name = names[Math.floor(Math.random() * names.length)]!;
		if (++ii > 4) {
			name += names[Math.floor(Math.random() * names.length)]!;
		}
		if (!exists(name)) {
			return name;
		}
	} while (true);
}

export function calculateRenewCost(creep: Creep) {
	return Math.ceil(C.SPAWN_RENEW_RATIO * calculateCost(creep) / C.CREEP_SPAWN_TIME / creep.body.length);
}

export function calculateRenewAmount(creep: Creep) {
	return Math.floor(C.SPAWN_RENEW_RATIO * C.CREEP_LIFE_TIME / C.CREEP_SPAWN_TIME / creep.body.length);
}
