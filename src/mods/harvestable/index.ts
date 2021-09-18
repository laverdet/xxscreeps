import type C from 'xxscreeps/game/constants';
import type { Creep } from 'xxscreeps/mods/creep/creep';
import type { RoomObject } from 'xxscreeps/game/object';
import type { Implementation } from 'xxscreeps/utility/types';
import type { Manifest } from 'xxscreeps/config/mods';

export type { Harvest } from './game';

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
