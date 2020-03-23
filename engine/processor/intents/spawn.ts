import * as C from '~/engine/game/constants';
import { calcCreepCost } from '~/engine/game/helpers';
import { bindProcessor } from '~/engine/processor/bind';
import { StructureSpawn } from '~/engine/game/objects/structures/spawn';
import * as Store from './store';

function createCreep(this: StructureSpawn, intent: any) {

	// Is this intent valid?
	const canBuild = this.spawnCreep(intent.body, intent.name, { dryRun: true, directions: intent.directions }) === C.OK;
	if (!canBuild) {
		return false;
	}

	// Withdraw energy
	const cost = calcCreepCost(intent.body);
	if (!Store.subtract.call(this.store, C.RESOURCE_ENERGY, cost)) {
		return false;
	}

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
