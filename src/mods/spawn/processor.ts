import type { PartType } from 'xxscreeps/mods/creep/creep';
import type { Direction } from 'xxscreeps/game/position';
import type { RoomObject } from 'xxscreeps/game/object';
import * as C from 'xxscreeps/game/constants';
import * as Fn from 'xxscreeps/utility/functional';
import * as StoreIntent from 'xxscreeps/mods/resource/processor/store';
import { Creep, create as createCreep } from 'xxscreeps/mods/creep/creep';
import { Game, me } from 'xxscreeps/game';
import { getPositonInDirection as getPositionInDirection } from 'xxscreeps/game/position';
import { InsertObject, MoveObject } from 'xxscreeps/game/room';
import { registerIntentProcessor, registerObjectTickProcessor } from 'xxscreeps/engine/processor';
import { Owner } from 'xxscreeps/game/object';
import { ALL_DIRECTIONS } from 'xxscreeps/game/position/direction';
import { makePositionChecker } from 'xxscreeps/game/path-finder/obstacle';
import { assign } from 'xxscreeps/utility/utility';
import { StructureExtension } from './extension';
import { SpawnId, SpawnTime, SpawningCreepId, StructureSpawn, checkRecycleCreep, checkSpawnCreep } from './spawn';

declare module 'xxscreeps/engine/processor' {
	interface Intent { spawn: typeof intents }
}
const intents = [
	registerIntentProcessor(StructureSpawn, 'recycleCreep', (spawn, context, id: string) => {
		const creep = Game.getObjectById<Creep>(id)!;
		if (checkRecycleCreep(spawn, creep) === C.OK) {
			// TODO: This stuff
			creep.hits = 0;
		}
	}),

	registerIntentProcessor(StructureSpawn, 'spawn', (
		spawn, context,
		body: PartType[],
		name: string,
		energyStructureIds: string[] | null,
		directions: Direction[] | null,
	) => {

		// Get energy structures
		const energyStructures = function() {
			const filter = (structure?: RoomObject): structure is StructureExtension | StructureSpawn =>
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
			StoreIntent.subtract(structure.store, 'energy', energyToSpend);
			cost -= energyToSpend;
			if (cost === 0) {
				break;
			}
		}

		// Add new creep to room objects
		const creep = createCreep(spawn.pos, body, name, me);
		spawn.room[InsertObject](creep);

		// Set spawning information
		const needTime = body.length * C.CREEP_SPAWN_TIME;
		spawn.spawning = assign(new StructureSpawn.Spawning, {
			directions: directions ?? [],
			needTime,
			[SpawnId]: spawn.id,
			[SpawningCreepId]: creep.id,
			[SpawnTime]: Game.time + needTime,
		});
		context.didUpdate();
	}),
];

registerObjectTickProcessor(StructureSpawn, (spawn, context) => {

	// Check creep spawning
	(() => {
		if (spawn.spawning && spawn.spawning[SpawnTime] <= Game.time) {
			const creep = Game.getObjectById<Creep>(spawn.spawning[SpawningCreepId]);
			if (creep && creep instanceof Creep) {
				// Look for spawn direction
				const check = makePositionChecker({
					room: spawn.room,
					type: 'creep',
					user: creep[Owner],
				});
				const directions = new Set(spawn.spawning.directions.length === 0 ?
					ALL_DIRECTIONS : spawn.spawning.directions as Direction[]);
				const direction = Fn.firstMatching(directions, direction => check(getPositionInDirection(creep.pos, direction)));

				// If no direction was found then defer this creep
				// TODO: Spawn stomp hostile creeps
				if (direction === undefined) {
					spawn.spawning[SpawnTime] = Game.time + 1;
					return;
				}

				// Creep can be spawned
				const hasClaim = creep.body.some(part => part.type === C.CLAIM);
				creep._ageTime = Game.time + (hasClaim ? C.CREEP_CLAIM_LIFE_TIME : C.CREEP_LIFE_TIME);
				creep.room[MoveObject](creep, getPositionInDirection(creep.pos, direction));
			}
			spawn.spawning = undefined;
			context.setActive();
		}
	})();

	// Add 1 energy per tick to spawns in low energy rooms
	if (spawn.room.energyAvailable < C.SPAWN_ENERGY_CAPACITY && spawn.store.energy < C.SPAWN_ENERGY_CAPACITY) {
		StoreIntent.add(spawn.store, C.RESOURCE_ENERGY, 1);
		context.setActive();
	}
});
