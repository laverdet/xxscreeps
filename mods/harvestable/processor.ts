import type { Implementation } from 'xxscreeps/util/types';
import type { RoomObject } from 'xxscreeps/game/objects/room-object';
import * as C from 'xxscreeps/game/constants';
import * as Game from 'xxscreeps/game/game';
import { Creep } from 'xxscreeps/game/objects/creep';
import { registerActionProcessor } from 'xxscreeps/processor';
import { Harvestable, checkHarvest } from './game';

// `RoomObject` harvest intent processor symbol
const ProcessHarvest = Symbol();
declare module 'xxscreeps/game/objects/room-object' {
	interface RoomObject {
		[ProcessHarvest](creep: Creep): boolean;
	}
}

// `Creep.harvest` intent processor registration hook
export function registerHarvestProcessor<Type extends RoomObject>(
	target: Implementation<Type>,
	process: (this: Type, creep: Creep) => boolean,
) {
	return target.prototype[ProcessHarvest] = process;
}

// Register `harvest` action processor
const action = registerActionProcessor(Creep, 'harvest', (creep, id: string) => {
	const target = Game.getObjectById<Harvestable>(id)!;
	if (checkHarvest(creep, target) === C.OK) {
		return target[ProcessHarvest](creep);
	} else {
		return false;
	}
});
declare module 'xxscreeps/processor' {
	interface Action { harvestable: typeof action }
}
