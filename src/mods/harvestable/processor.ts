import type { Harvestable } from './game';
import type { Implementation } from 'xxscreeps/utility/types';
import type { RoomObject } from 'xxscreeps/game/object';
import C from 'xxscreeps/game/constants';
import { Game } from 'xxscreeps/game';
import { saveAction } from 'xxscreeps/game/object';
import { Creep } from 'xxscreeps/mods/creep/creep';
import { registerIntentProcessor } from 'xxscreeps/engine/processor';
import { appendEventLog } from 'xxscreeps/game/room/event-log';
import { checkHarvest } from './creep';

// `RoomObject` harvest intent processor symbol
const ProcessHarvest = Symbol('processHarvest');
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
declare module 'xxscreeps/engine/processor' {
	interface Intent { harvestable: typeof intent }
}
const intent = registerIntentProcessor(Creep, 'harvest', {
	before: 'move',
	type: 'primary',
}, (creep, context, id: string) => {
	const target = Game.getObjectById<Harvestable>(id)!;
	if (checkHarvest(creep, target) === C.OK) {
		const amount = target[ProcessHarvest](creep, target);
		appendEventLog(target.room, {
			event: C.EVENT_HARVEST,
			amount,
			objectId: creep.id,
			targetId: target.id,
		});
		saveAction(creep, 'harvest', target.pos);
		context.didUpdate();
	}
});
