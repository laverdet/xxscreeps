import * as C from 'xxscreeps/game/constants';
import * as Game from 'xxscreeps/game/game';
import { getPositonInDirection, Direction, RoomPosition } from 'xxscreeps/game/position';
import * as Room from 'xxscreeps/game/room';
import * as Creep from 'xxscreeps/game/objects/creep';
import { registerIntentProcessor, registerTickProcessor } from 'xxscreeps/processor';
import { RoomObject } from 'xxscreeps/game/objects/room-object';
import { StructureExtension } from 'xxscreeps/game/objects/structures/extension';
import { checkSpawnCreep, StructureSpawn } from 'xxscreeps/game/objects/structures/spawn';
import { accumulate, instantiate } from 'xxscreeps/util/utility';
import * as CreepIntent from './creep';
import { newRoomObject } from './room-object';
import * as StoreIntent from './store';

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

declare module 'xxscreeps/processor' {
	interface Intent { spawn: typeof intent }
}
const intent = registerIntentProcessor(StructureSpawn, 'spawn',
(spawn, body: Creep.PartType[], name: string, energyStructureIds: string[] | null, directions: Direction[] | null) => {

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
	let cost = accumulate(body, part => C.BODYPART_COST[part]);
	for (const structure of energyStructures) {
		const energyToSpend = Math.min(cost, structure.energy);
		StoreIntent.subtract(structure.store, 'energy', energyToSpend);
		cost -= energyToSpend;
		if (cost === 0) {
			break;
		}
	}

	// Add new creep to room objects
	const creep = CreepIntent.create(body, spawn.pos, name, Game.me);
	Room.insertObject(spawn.room, creep);

	// Set spawning information
	const needTime = body.length * C.CREEP_SPAWN_TIME;
	spawn.spawning = {
		creep: creep.id,
		directions: directions ?? [],
		endTime: Game.time + needTime,
		needTime,
	};
});

registerTickProcessor(StructureSpawn, spawn => {
	if (spawn.spawning && spawn.spawning.endTime <= Game.time) {
		const creep = Game.getObjectById(spawn.spawning.creep);
		if (creep && creep instanceof Creep.Creep) {
			const hasClaim = creep.body.some(part => part.type === 'claim');
			creep._ageTime = Game.time + (hasClaim ? C.CREEP_CLAIM_LIFE_TIME : C.CREEP_LIFE_TIME);
			Room.moveObject(creep, getPositonInDirection(creep.pos, C.TOP));
		}
		spawn.spawning = undefined;
	}

	if (spawn.room.energyAvailable < C.SPAWN_ENERGY_CAPACITY && spawn.store.energy < C.SPAWN_ENERGY_CAPACITY) {
		StoreIntent.add(spawn.store, 'energy', 1);
	}
});
