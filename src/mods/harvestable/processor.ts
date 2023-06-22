import type { Harvestable } from './game.js';
import type { Implementation } from 'xxscreeps/utility/types.js';
import type { RoomObject } from 'xxscreeps/game/object.js';
import C from 'xxscreeps/game/constants/index.js';
import { Game } from 'xxscreeps/game/index.js';
import { saveAction } from 'xxscreeps/game/object.js';
import { Creep } from 'xxscreeps/mods/creep/creep.js';
import { registerIntentProcessor } from 'xxscreeps/engine/processor/index.js';
import { appendEventLog } from 'xxscreeps/game/room/event-log.js';
import { checkHarvest } from './creep.js';

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
