import type { Harvestable } from './game.js';
import type { ProcessorContext } from 'xxscreeps/engine/processor/room.js';
import type { RoomObject } from 'xxscreeps/game/object.js';
import type { Implementation } from 'xxscreeps/utility/types.js';
import { registerIntentProcessor } from 'xxscreeps/engine/processor/index.js';
import { Game } from 'xxscreeps/game/index.js';
import { saveAction } from 'xxscreeps/game/object.js';
import { appendEventLog } from 'xxscreeps/game/room/event-log.js';
import { Creep } from 'xxscreeps/mods/classic/creep/creep.js';
import * as C from 'xxscreeps:mods/constants';
import { checkHarvest } from './creep.js';

// `RoomObject` harvest intent processor symbol
const ProcessHarvest = Symbol('processHarvest');
declare module 'xxscreeps/game/object.js' {
	interface RoomObject {
		[ProcessHarvest]: (creep: Creep, target: RoomObject, context: ProcessorContext) => number;
	}
}

// `Creep.harvest` intent processor registration hook
export function registerHarvestProcessor<Type extends RoomObject>(
	target: Implementation<Type>,
	process: (creep: Creep, target: Type, context: ProcessorContext) => number,
) {
	return target.prototype[ProcessHarvest] = process as RoomObject[typeof ProcessHarvest];
}

export type HarvestableIntents = [ typeof intent ];
// Register `harvest` action processor
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const intent = registerIntentProcessor(Creep, 'harvest', {
	before: 'move',
	type: 'primary',
}, (creep, context, id: string) => {
	const target = Game.getObjectById<Harvestable>(id)!;
	if (checkHarvest(creep, target) === C.OK) {
		const amount = target[ProcessHarvest](creep, target, context);
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
