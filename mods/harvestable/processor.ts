import type { Implementation } from 'xxscreeps/utility/types';
import type { RoomObject } from 'xxscreeps/game/object';
import * as C from 'xxscreeps/game/constants';
import * as Game from 'xxscreeps/game';
import { Creep } from 'xxscreeps/mods/creep/creep';
import { registerIntentProcessor } from 'xxscreeps/processor';
import { appendEventLog } from 'xxscreeps/game/room/event-log';
import { saveAction } from 'xxscreeps/game/action-log';
import { checkHarvest } from './creep';
import { Harvestable } from './game';

// `RoomObject` harvest intent processor symbol
const ProcessHarvest = Symbol();
declare module 'xxscreeps/game/object' {
	interface RoomObject {
		[ProcessHarvest](creep: Creep, target: RoomObject): number;
	}
}

// `Creep.harvest` intent processor registration hook
export function registerHarvestProcessor<Type extends RoomObject>(
	target: Implementation<Type>,
	process: (creep: Creep, target: Type) => number,
) {
	return target.prototype[ProcessHarvest] = process;
}

// Register `harvest` action processor
declare module 'xxscreeps/processor' {
	interface Intent { harvestable: typeof intent }
}
const intent = registerIntentProcessor(Creep, 'harvest', (creep, id: string) => {
	const target = Game.getObjectById<Harvestable>(id)!;
	if (checkHarvest(creep, target) === C.OK) {
		const amount = target[ProcessHarvest](creep, target);
		appendEventLog(target.room, {
			event: C.EVENT_HARVEST,
			amount,
			objectId: creep.id,
			targetId: target.id,
		});
		saveAction(creep, 'harvest', target.pos.x, target.pos.y);
		return amount > 0;
	} else {
		return false;
	}
});
