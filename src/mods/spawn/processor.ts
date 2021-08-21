import type { PartType } from 'xxscreeps/mods/creep/creep';
import type { Direction } from 'xxscreeps/game/position';
import type { RoomObject } from 'xxscreeps/game/object';
import * as C from 'xxscreeps/game/constants';
import * as Fn from 'xxscreeps/utility/functional';
import * as ControllerProc from 'xxscreeps/mods/controller/processor';
import { RoomPosition, getPositionInDirection } from 'xxscreeps/game/position';
import { Creep, create as createCreep } from 'xxscreeps/mods/creep/creep';
import { Game, me } from 'xxscreeps/game';
import { Room } from 'xxscreeps/game/room';
import { registerIntentProcessor, registerObjectTickProcessor } from 'xxscreeps/engine/processor';
import { ALL_DIRECTIONS } from 'xxscreeps/game/direction';
import { makePositionChecker } from 'xxscreeps/game/path-finder/obstacle';
import { assign } from 'xxscreeps/utility/utility';
import { StructureExtension } from './extension';
import { StructureSpawn, calculateRenewAmount, calculateRenewCost, checkDirections, checkRecycleCreep, checkRenewCreep, checkSpawnCreep, create } from './spawn';
import { OwnedStructure, checkMyStructure } from 'xxscreeps/mods/structure/structure';
import { StructureController } from 'xxscreeps/mods/controller/controller';
import { saveAction } from 'xxscreeps/game/object';
import { createRuin } from 'xxscreeps/mods/structure/ruin';

function consumeEnergy(spawn: StructureSpawn, amount: number) {
	const energyStructures = spawn.room.find(C.FIND_STRUCTURES).filter(
		(structure): structure is StructureSpawn | StructureExtension =>
			structure.structureType === C.STRUCTURE_SPAWN || structure.structureType === C.STRUCTURE_EXTENSION);
	energyStructures.sort((left, right) => left.pos.getRangeTo(spawn.pos) - right.pos.getRangeTo(spawn.pos));

	if (Fn.accumulate(energyStructures, structure => structure.store[C.RESOURCE_ENERGY]) < amount) {
		throw new Error('Not enough');
	}
	let remaining = amount;
	for (const structure of energyStructures) {
		const subtraction = Math.min(remaining, structure.store[C.RESOURCE_ENERGY]);
		structure.store['#subtract'](C.RESOURCE_ENERGY, subtraction);
		if ((remaining -= subtraction) === 0) {
			return;
		}
	}
	throw new Error('Did not subtract energy correctly.');
}

declare module 'xxscreeps/engine/processor' {
	interface Intent { spawn: typeof intents }
}
const intents = [
	registerIntentProcessor(Room, 'placeSpawn', { internal: true },
		(room, context, xx: number, yy: number, name: string) => {
			const pos = new RoomPosition(xx, yy, room.name);
			if (room['#user'] === null) {
				// Remove existing objects
				for (const object of room['#objects']) {
					if (object['#user'] === null) {
						if (object.hits !== undefined) {
							room['#removeObject'](object);
						}
					} else if (object instanceof OwnedStructure) {
						const ruin = createRuin(object, 100000);
						room['#insertObject'](ruin);
						room['#removeObject'](object);
					} else {
						room['#removeObject'](object);
					}
				}
				// Set up initial player state
				ControllerProc.claim(context, room.controller!, me);
				room['#insertObject'](create(pos, me, name));
				room['#cumulativeEnergyHarvested'] = 0;
				room['#safeModeUntil'] = Game.time + C.SAFE_MODE_DURATION;
				context.didUpdate();
			}
		}),

	registerIntentProcessor(Room, 'unspawn', { internal: true }, (room, context) => {
		for (const object of room['#objects']) {
			if (object instanceof StructureController) {
				if (object.room['#user'] === me) {
					ControllerProc.release(context, object);
				}
			} else if (object['#user'] === me) {
				if (object instanceof OwnedStructure) {
					object['#user'] = '1';
					const ruin = createRuin(object, 500000);
					room['#insertObject'](ruin);
					room['#removeObject'](object);
				} else {
					room['#removeObject'](object);
				}
				context.didUpdate();
			}
		}
	}),

	registerIntentProcessor(StructureSpawn, 'cancelSpawning', {}, (spawn, context) => {
		const spawning = spawn.spawning;
		if (checkMyStructure(spawn, StructureSpawn) === C.OK && spawning) {
			const creep = Game.getObjectById(spawning['#spawningCreepId'])!;
			spawn.room['#removeObject'](creep);
			spawn.spawning = null;
			context.didUpdate();
		}
	}),

	registerIntentProcessor(StructureSpawn, 'recycleCreep', {}, (spawn, context, id: string) => {
		const creep = Game.getObjectById<Creep>(id)!;
		if (checkRecycleCreep(spawn, creep) === C.OK) {
			// TODO: This stuff
			creep.hits = 0;
			context.didUpdate();
		}
	}),

	registerIntentProcessor(StructureSpawn, 'renewCreep', {}, (spawn, context, id: string) => {
		const creep = Game.getObjectById<Creep>(id)!;
		if (checkRenewCreep(spawn, creep) === C.OK) {
			saveAction(creep, 'healed', spawn.pos);
			consumeEnergy(spawn, calculateRenewCost(creep));
			creep['#ageTime'] += calculateRenewAmount(creep);
			context.didUpdate();
		}
	}),

	registerIntentProcessor(StructureSpawn, 'setSpawnDirections', {}, (spawn, context, directions: Direction[]) => {
		const spawning = spawn.spawning;
		if (checkMyStructure(spawn, StructureSpawn) === C.OK && checkDirections(directions) && spawning) {
			spawning.directions = directions;
			context.didUpdate();
		}
	}),

	registerIntentProcessor(StructureSpawn, 'spawn', {}, (
		spawn, context,
		body: PartType[],
		name: string,
		energyStructureIds: string[] | null,
		directions: Direction[] | null,
	) => {

		// Get energy structures
		const energyStructures = function() {
			const filter = (structure: RoomObject | null): structure is StructureExtension | StructureSpawn =>
				structure instanceof StructureExtension || structure instanceof StructureSpawn;
			if (energyStructureIds) {
				return energyStructureIds.map(id => Game.getObjectById(id)).filter(filter);
			} else {
				const structures = spawn.room.find(C.FIND_STRUCTURES).filter(filter);
				return structures.sort((left, right) =>
					(left.structureType === 'extension' ? 1 : 0) - (right.structureType === 'extension' ? 1 : 0) ||
				left.pos.getRangeTo(spawn.pos) - right.pos.getRangeTo(spawn.pos));
			}
		}();

		// Is this intent valid?
		const canBuild = checkSpawnCreep(spawn, body, name, directions, energyStructures) === C.OK;
		if (!canBuild) {
			return false;
		}

		// Withdraw energy
		let cost = Fn.accumulate(body, part => C.BODYPART_COST[part]);
		for (const structure of energyStructures) {
			const energyToSpend = Math.min(cost, structure.energy);
			structure.store['#subtract'](C.RESOURCE_ENERGY, energyToSpend);
			cost -= energyToSpend;
			if (cost === 0) {
				break;
			}
		}
		spawn.room.energyAvailable -= cost;

		// Add new creep to room objects
		const creep = createCreep(spawn.pos, body, name, me);
		creep['#ageTime'] = 0;
		spawn.room['#insertObject'](creep);

		// Set spawning information
		const needTime = body.length * C.CREEP_SPAWN_TIME;
		const spawning = spawn.spawning = assign(new StructureSpawn.Spawning, {
			directions: directions ?? undefined,
			needTime,
		});
		spawning['#spawnId'] = spawn.id;
		spawning['#spawningCreepId'] = creep.id;
		spawning['#spawnTime'] = Game.time + needTime - 1;
		context.didUpdate();
	}),
];

registerObjectTickProcessor(StructureSpawn, (spawn, context) => {

	// Check creep spawning
	(() => {
		if (spawn.spawning && spawn.spawning.remainingTime === 0) {
			const creep = Game.getObjectById<Creep>(spawn.spawning['#spawningCreepId']);
			if (creep && creep instanceof Creep) {
				// Look for spawn direction
				const check = makePositionChecker({
					checkTerrain: true,
					room: spawn.room,
					user: creep['#user'],
				});
				const directions = new Set(spawn.spawning.directions ?? ALL_DIRECTIONS);
				const direction = Fn.firstMatching(directions, direction => check(getPositionInDirection(creep.pos, direction)));

				// If no direction was found then defer this creep
				// TODO: Spawn stomp hostile creeps
				if (direction === undefined) {
					spawn.spawning['#spawnTime'] = Game.time + 1;
					return;
				}

				// Creep can be spawned
				const hasClaim = creep.body.some(part => part.type === C.CLAIM);
				creep['#ageTime'] = Game.time + (hasClaim ? C.CREEP_CLAIM_LIFE_TIME : C.CREEP_LIFE_TIME) - 1;
				creep.room['#moveObject'](creep, getPositionInDirection(creep.pos, direction));
			}
			spawn.spawning = null;
			context.setActive();
		}
	})();

	// Add 1 energy per tick to spawns in low energy rooms
	if (spawn.room.energyAvailable < C.SPAWN_ENERGY_CAPACITY && spawn.store.energy < C.SPAWN_ENERGY_CAPACITY) {
		spawn.store['#add'](C.RESOURCE_ENERGY, 1);
		context.setActive();
	}
});
