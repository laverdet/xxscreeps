import type { ContextType, Fallback, Implementation } from 'xxscreeps/util/types';
import * as C from 'xxscreeps/game/constants';
import * as Game from 'xxscreeps/game/game';
import * as Id from 'xxscreeps/engine/util/schema/id';
import { constant, struct, variant } from 'xxscreeps/schema';
import { RoomObject, chainIntentChecks } from 'xxscreeps/game/objects/room-object';
import { Creep, checkCommon } from 'xxscreeps/game/objects/creep';
import { registerSchema } from 'xxscreeps/engine/schema';

// `RoomObject` intent check symbol
const CheckHarvest = Symbol();
declare module 'xxscreeps/game/objects/room-object' {
	interface RoomObject {
		[CheckHarvest](creep: Creep): C.ErrorCode;
	}
}

// Creep.harvest runtime registration hook
export interface Harvest {}
export type Harvestable = Fallback<ContextType<Harvest[keyof Harvest]>, RoomObject>;
type HarvestResult = ReturnType<Harvest[keyof Harvest]>;

export function registerHarvestable<Type extends RoomObject, Error extends C.ErrorCode>(
	target: Implementation<Type>,
	check: (this: Type, creep: Creep) => Error,
) {
	return target.prototype[CheckHarvest] = check;
}
registerHarvestable(RoomObject, () => C.ERR_INVALID_TARGET);

// `harvest` intent check
export function checkHarvest(creep: Creep, target: Harvestable) {
	return chainIntentChecks(
		() => checkCommon(creep),
		() => target[CheckHarvest](creep),
	) as HarvestResult;
}

// `Creep.harvest` runtime method
declare module 'xxscreeps/game/objects/creep' {
	interface Creep {
		harvest(target: Harvestable): HarvestResult;
	}
}

Creep.prototype.harvest = function(target) {
	return chainIntentChecks(
		() => checkHarvest(this, target),
		() => Game.intents.save(this, 'harvest', target.id));
};

// Event log type
const eventLog = registerSchema('Room.eventLog', struct({
	...variant(C.EVENT_HARVEST),
	event: constant(C.EVENT_HARVEST),
	objectId: Id.format,
	targetId: Id.format,
	amount: 'int32',
}));
declare module 'xxscreeps/engine/schema' {
	interface Schema { harvestable: typeof eventLog }
}
