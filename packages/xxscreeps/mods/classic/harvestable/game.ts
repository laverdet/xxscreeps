import type { Creep } from 'xxscreeps/mods/classic/creep/creep.js';
import type { ContextType, Implementation } from 'xxscreeps/utility/types.js';
import * as C from 'xxscreeps/game/constants/index.js';
import { RoomObject } from 'xxscreeps/game/object.js';
import './creep.js';
import './schema.js';

// `RoomObject` intent check symbol
declare module 'xxscreeps/game/object.js' {
	interface RoomObject {
		'#checkHarvest': (creep: Creep) => C.ErrorCode;
	}
}

export function registerHarvestable<Type extends RoomObject, Error extends C.ErrorCode>(
	target: Implementation<Type>,
	check: (this: Type, creep: Creep) => Error,
) {
	return target.prototype['#checkHarvest'] = check;
}

// Creep.harvest runtime registration hook
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface Harvest {}
export type Harvestable = ContextType<Harvest[keyof Harvest]>;
export type HarvestResult = ReturnType<Harvest[keyof Harvest]>;
registerHarvestable(RoomObject, () => C.ERR_INVALID_TARGET);
