import * as C from '~/engine/game/constants';
import { gameContext } from '~/engine/game/context';
import { calcCreepCost } from '~/engine/game/helpers';
import * as Room from '~/engine/game/room';
import { bindProcessor } from '~/engine/processor/bind';
import { StructureSpawn } from '~/engine/game/objects/structures/spawn';
import * as CreepProcessor from './creep';
import * as StoreProcessor from './store';

function createCreep(this: StructureSpawn, intent: any) {

	// Is this intent valid?
	const canBuild = this.spawnCreep(intent.body, intent.name, { dryRun: true, directions: intent.directions }) === C.OK;
	if (!canBuild) {
		return false;
	}

	// Withdraw energy
	const cost = calcCreepCost(intent.body);
	if (!StoreProcessor.subtract.call(this.store, C.RESOURCE_ENERGY, cost)) {
		return false;
	}

	// Spawn it!
	const creep = CreepProcessor.create(intent.body, this.pos, intent.name, gameContext.userId);
	this.room[Room.Objects].push(creep);

	return true;
}

export default () => bindProcessor(StructureSpawn, {
	process(this: StructureSpawn, intent) {
		if (intent.createCreep) {
			return createCreep.call(this, intent.createCreep);
		}

		return false;
	},
});
