import type C from 'xxscreeps/game/constants/index.js';
import type { Creep } from 'xxscreeps/mods/creep/creep.js';
import type { RoomObject } from 'xxscreeps/game/object.js';
import type { Implementation } from 'xxscreeps/utility/types.js';
import type { Manifest } from 'xxscreeps/config/mods/index.js';

export type { Harvest } from './game.js';

export function registerHarvestable<Type extends RoomObject, Error extends C.ErrorCode>(
	target: Implementation<Type>,
	check: (this: Type, creep: Creep) => Error,
) {
	return target.prototype['#checkHarvest'] = check;
}

export const manifest: Manifest = {
	dependencies: [ 'xxscreeps/mods/creep' ],
	provides: [ 'constants', 'game', 'processor' ],
};
