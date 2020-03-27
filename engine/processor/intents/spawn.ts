import * as C from '~/game/constants';
import { gameContext } from '~/game/context';
import { calcCreepCost } from '~/game/helpers';
import { getPositonInDirection, Direction } from '~/game/position';
import * as Creep from '~/game/objects/creep';
import * as Room from '~/game/room';
import { bindProcessor } from '~/engine/processor/bind';
import { StructureSpawn } from '~/game/objects/structures/spawn';
import * as CreepProcessor from './creep';
import * as StoreProcessor from './store';

type Parameters = {
	spawn: {
		body: C.BodyPart[];
		name: string;
		directions?: Direction[];
	};
};

export type Intents = {
	receiver: StructureSpawn;
	parameters: Parameters;
};

function createCreep(spawn: StructureSpawn, intent: Parameters['spawn']) {

	// Is this intent valid?
	const canBuild = spawn.spawnCreep(intent.body, intent.name, { dryRun: true, directions: intent.directions }) === C.OK;
	if (!canBuild) {
		return false;
	}

	// Withdraw energy
	const cost = calcCreepCost(intent.body);
	if (!StoreProcessor.subtract(spawn.store, C.RESOURCE_ENERGY, cost)) {
		return false;
	}

	// Add new creep to room objects
	const creep = CreepProcessor.create(intent.body, spawn.pos, intent.name, gameContext.userId);
	spawn.room[Room.Objects].push(creep);

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
				creep[Creep.AgeTime] = Game.time + C.CREEP_LIFE_TIME;
				creep.pos = getPositonInDirection(creep.pos, C.TOP);
			}
			this.spawning = undefined;
		}
		return false;
	},
});
